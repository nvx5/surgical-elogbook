import { useCallback, useEffect, useLayoutEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import {
  clampSignatureForStorage,
  CONSULTANT_SIGNATURE_FORMAT_VERSION,
  consultantSignatureIsEmpty,
  type ConsultantSignatureData,
  type ConsultantSigPoint,
} from '../consultantSignature';

type Props = {
  value: ConsultantSignatureData | null;
  onChange: (next: ConsultantSignatureData | null) => void;
};

const PAD_W = 640;
const PAD_H = 220;
const MIN_POINT_DIST = 0.004;

function clientToNorm(canvas: HTMLCanvasElement, clientX: number, clientY: number): ConsultantSigPoint | null {
  const r = canvas.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0) return null;
  const x = (clientX - r.left) / r.width;
  const y = (clientY - r.top) / r.height;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return {
    x: Math.min(1, Math.max(0, x)),
    y: Math.min(1, Math.max(0, y)),
  };
}

function drawStrokes(ctx: CanvasRenderingContext2D, strokes: ConsultantSigPoint[][], cssW: number, cssH: number) {
  ctx.save();
  ctx.clearRect(0, 0, cssW, cssH);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, cssW, cssH);
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const stroke of strokes) {
    if (stroke.length === 0) continue;
    ctx.beginPath();
    ctx.moveTo(stroke[0]!.x * cssW, stroke[0]!.y * cssH);
    for (let i = 1; i < stroke.length; i++) {
      ctx.lineTo(stroke[i]!.x * cssW, stroke[i]!.y * cssH);
    }
    ctx.stroke();
  }
  ctx.restore();
}

function dist2(a: ConsultantSigPoint, b: ConsultantSigPoint): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

export function ConsultantSignaturePad({ value, onChange }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const strokesRef = useRef<ConsultantSigPoint[][]>(value?.strokes ? value.strokes.map((s) => [...s]) : []);
  const drawingRef = useRef(false);

  const paint = useCallback(() => {
    const el = canvasRef.current;
    if (!el) return;
    const ctx = el.getContext('2d');
    if (!ctx) return;
    if (!syncCanvasBitmap(el, ctx)) return;
    const cssW = el.clientWidth;
    const cssH = el.clientHeight;
    drawStrokes(ctx, strokesRef.current, cssW, cssH);
  }, []);

  useLayoutEffect(() => {
    strokesRef.current = value?.strokes ? value.strokes.map((s) => [...s]) : [];
    paint();
    const id = window.requestAnimationFrame(() => {
      paint();
      window.requestAnimationFrame(() => paint());
    });
    return () => window.cancelAnimationFrame(id);
  }, [value, paint]);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => paint());
    ro.observe(el);
    return () => ro.disconnect();
  }, [paint]);

  function syncCanvasBitmap(el: HTMLCanvasElement, ctx: CanvasRenderingContext2D) {
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    const cssW = el.clientWidth;
    const cssH = el.clientHeight;
    if (cssW < 2 || cssH < 2) return false;
    const bw = Math.max(1, Math.round(cssW * dpr));
    const bh = Math.max(1, Math.round(cssH * dpr));
    if (el.width !== bw || el.height !== bh) {
      el.width = bw;
      el.height = bh;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return true;
  }

  function pushPoint(p: ConsultantSigPoint) {
    const strokes = strokesRef.current;
    const cur = strokes[strokes.length - 1];
    if (!cur) return;
    if (cur.length === 0) {
      cur.push(p);
      return;
    }
    const prev = cur[cur.length - 1]!;
    if (dist2(prev, p) < MIN_POINT_DIST * MIN_POINT_DIST) return;
    cur.push(p);
  }

  function emit() {
    const raw: ConsultantSignatureData = {
      v: CONSULTANT_SIGNATURE_FORMAT_VERSION,
      w: PAD_W,
      h: PAD_H,
      strokes: strokesRef.current.map((s) => [...s]),
    };
    if (consultantSignatureIsEmpty(raw)) {
      onChange(null);
      return;
    }
    onChange(clampSignatureForStorage(raw));
  }

  function onPointerDown(e: ReactPointerEvent<HTMLCanvasElement>) {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    const p = clientToNorm(canvas, e.clientX, e.clientY);
    if (!p) return;
    strokesRef.current = [...strokesRef.current, [p]];
    paint();
  }

  function onPointerMove(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const p = clientToNorm(canvas, e.clientX, e.clientY);
    if (!p) return;
    pushPoint(p);
    paint();
  }

  function endStroke() {
    drawingRef.current = false;
    emit();
  }

  function clear() {
    strokesRef.current = [];
    paint();
    onChange(null);
  }

  return (
    <div className="mt-3 space-y-2">
      <canvas
        ref={canvasRef}
        className="signature-touch-pad h-[11rem] w-full max-w-full cursor-crosshair rounded-lg border border-slate-200 bg-white touch-none"
        style={{ aspectRatio: `${PAD_W} / ${PAD_H}` }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endStroke}
        onPointerCancel={endStroke}
        onPointerLeave={(e: ReactPointerEvent<HTMLCanvasElement>) => {
          if (drawingRef.current) endStroke();
          e.preventDefault();
        }}
      />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
          onClick={clear}
        >
          Clear signature
        </button>
      </div>
    </div>
  );
}
