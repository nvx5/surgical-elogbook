import { MagicWand } from '@phosphor-icons/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AiCasePatch } from '../caseAiAutofill';

const MAX_TEXT = 200;

/** Matches default AIML_MODEL in `supabase/functions/case-ai-autofill`; override via PUBLIC_AI_MODEL. */
const AI_MODEL_DISPLAY = import.meta.env.PUBLIC_AI_MODEL?.trim() || 'gpt-4o-mini';

type Props = {
  supabase: SupabaseClient;
  hidden?: boolean;
  onApplyPatch: (patch: AiCasePatch) => void;
};

/** Minimal typings — DOM SpeechRecognition is not in all TS lib presets. */
type SpeechRecognitionResultListLike = {
  length: number;
  [index: number]: { transcript: string };
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: SpeechRecognitionResultListLike;
};

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecCtor = new () => SpeechRecognitionLike;

function getSpeechRecognitionConstructor(): SpeechRecCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as Window & {
    SpeechRecognition?: SpeechRecCtor;
    webkitSpeechRecognition?: SpeechRecCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function CaseAiAssist({ supabase, hidden, onApplyPatch }: Props) {
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [speechUnsupported, setSpeechUnsupported] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    return () => {
      try {
        recognitionRef.current?.stop();
      } catch {
        /* ignore */
      }
      recognitionRef.current = null;
    };
  }, []);

  const stopListening = useCallback(() => {
    try {
      recognitionRef.current?.stop();
    } catch {
      /* ignore */
    }
    recognitionRef.current = null;
    setListening(false);
  }, []);

  const toggleListening = useCallback(() => {
    setLocalError(null);
    if (listening) {
      stopListening();
      return;
    }
    const Ctor = getSpeechRecognitionConstructor();
    if (!Ctor) {
      setSpeechUnsupported(true);
      return;
    }
    const rec = new Ctor();
    rec.lang = 'en-GB';
    rec.continuous = true;
    rec.interimResults = false;
    rec.onresult = (event: SpeechRecognitionEventLike) => {
      let chunk = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        chunk += event.results[i]?.transcript ?? '';
      }
      const t = chunk.trim();
      if (!t) return;
      setPrompt((prev) => {
        const base = prev.trimEnd();
        const next = base ? `${base} ${t}` : t;
        return next.slice(0, MAX_TEXT);
      });
    };
    rec.onerror = () => {
      setListening(false);
      recognitionRef.current = null;
    };
    rec.onend = () => {
      setListening(false);
      recognitionRef.current = null;
    };
    recognitionRef.current = rec;
    try {
      rec.start();
      setListening(true);
    } catch {
      setLocalError('Could not start voice input.');
      recognitionRef.current = null;
      setListening(false);
    }
  }, [listening, stopListening]);

  async function runExtract() {
    const text = prompt.trim();
    setLocalError(null);
    if (!text) {
      setLocalError('Describe the case first, then press Fill form.');
      return;
    }
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke<{ patch?: AiCasePatch; error?: string; details?: string }>(
        'case-ai-autofill',
        { body: { text } },
      );
      if (error) {
        const msg = error.message || 'Request failed';
        setLocalError(msg);
        return;
      }
      if (data && typeof data === 'object' && 'error' in data && typeof data.error === 'string') {
        const detail = typeof data.details === 'string' ? ` ${data.details}` : '';
        setLocalError(`${data.error}${detail}`);
        return;
      }
      if (!data?.patch || typeof data.patch !== 'object') {
        setLocalError('Unexpected response from assistant.');
        return;
      }
      onApplyPatch(data.patch);
    } finally {
      setBusy(false);
    }
  }

  if (hidden) return null;

  return (
    <section
      className="mt-6 w-full max-w-none rounded-2xl border border-clinical-200/90 bg-gradient-to-br from-violet-50/40 via-white to-clinical-50/70 p-5 shadow-card sm:p-6"
      aria-labelledby="case-ai-assist-heading"
    >
      <div className="min-w-0 w-full">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="case-ai-assist-heading" className="text-base font-bold tracking-tight text-slate-900">
            Quick-fill with AI
          </h2>
          <MagicWand size={20} weight="duotone" className="shrink-0 text-violet-600" aria-hidden />
        </div>
        <p className="mt-2 w-full max-w-none text-sm leading-relaxed text-slate-600">
          Type or dictate a short summary including procedure, setting, urgency, or trust. This uses{' '}
          <span className="font-medium text-slate-800">{AI_MODEL_DISPLAY}</span> to generate suggestions.
        </p>
      </div>

      <div className="mt-4 flex w-full min-w-0 flex-nowrap items-center gap-1.5 rounded-xl border border-slate-200/95 bg-white py-1 pl-3 pr-1 shadow-sm ring-clinical-500/20 transition focus-within:border-clinical-400 focus-within:ring-2 focus-within:ring-clinical-500/20 sm:gap-2">
        <input
          type="text"
          className="min-w-0 flex-1 border-0 bg-transparent py-2.5 text-base text-slate-900 outline-none ring-0 placeholder:text-slate-400"
          placeholder="e.g. Elective lap chole at Guy’s, I assisted, Mr Smith…"
          maxLength={MAX_TEXT}
          value={prompt}
          disabled={busy}
          onChange={(e) => setPrompt(e.target.value.slice(0, MAX_TEXT))}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              if (!busy) void runExtract();
            }
          }}
          aria-label="Case description for AI"
        />
        <button
          type="button"
          disabled={busy || speechUnsupported}
          onClick={toggleListening}
          aria-label={listening ? 'Stop voice input' : 'Speak to fill using browser voice recognition'}
          aria-pressed={listening}
          title={
            speechUnsupported
              ? 'Voice recognition is not supported in this browser'
              : listening
                ? 'Stop listening'
                : 'Speak (browser voice recognition)'
          }
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition sm:h-11 sm:w-11 ${
            listening
              ? 'bg-red-600 text-white shadow-sm hover:bg-red-700'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-40'
          }`}
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
            />
          </svg>
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void runExtract()}
          className="shrink-0 rounded-lg bg-clinical-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-clinical-700 disabled:opacity-60 sm:px-4 sm:py-2.5"
        >
          {busy ? 'Working…' : 'Fill form'}
        </button>
      </div>

      <div className="mt-2 flex w-full flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
        <span>
          {prompt.length}/{MAX_TEXT} characters
        </span>
        {speechUnsupported ? <span>Voice input unavailable in this browser.</span> : null}
      </div>

      {localError ? (
        <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
          {localError}
        </p>
      ) : null}
    </section>
  );
}
