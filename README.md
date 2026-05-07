# Surgical eLogbook (MVP)

A small, mobile-first surgical training logbook: Astro public site + React app at `/app/`, Supabase Auth + Postgres with Row Level Security, client-side PDF/CSV/JSON export, and a minimal PWA shell.

## Principles

- **Simple stack:** no custom backend, no Prisma, no Redux, no Workers.
- **Direct Supabase access** from the browser with the anon key (RLS enforced).
- **No patient-identifiable data** in schema or UI; notes are optional, length-limited, and blocked with simple heuristics.
- **Low cost:** no uploads, no stored PDFs, no Realtime subscriptions in the MVP.

## Prerequisites

- Node 20+ recommended
- A [Supabase](https://supabase.com/) project (free tier is fine)

## Supabase setup

1. Create a project and open **Project Settings → API** for `URL` and `anon` `public` key.
2. In **Authentication → Providers**, enable **Email** (password).
3. Open the **SQL Editor**, paste `supabase/schema.sql`, and run it once.
   - If you already ran an older schema without `cases.hospital`, run **`supabase/add_case_hospital.sql` once** (adds the column, index, and tells PostgREST to reload its schema cache). Without this, saves or searches can fail with: *Could not find the 'hospital' column of 'cases' in the schema cache*.
   - Run **`supabase/add_case_specialty.sql` once** if `cases` has no `specialty` column yet (`text not null`; presets are UI-only). To drop a legacy DB-only whitelist constraint if it exists, use **`supabase/remove_cases_specialty_check.sql`**.
   - If signup metadata (full name, grade) is not copied into `public.users`, run `supabase/patch_handle_new_user_metadata.sql` once in the SQL Editor (or re-apply the `handle_new_user` function from `schema.sql`).
   - Drops legacy `profiles` / old `cases` if present, then creates **`public.users`** (id, email, preferences, consultants, grade) and **`public.cases`** (operation tags as jsonb, consultant as jsonb, cepod, role, notes, etc.), indexes, `updated_at` triggers, an `auth.users` trigger to insert a `public.users` row on signup, RLS, and grants.

### Row Level Security (RLS)

- **`public.users`:** users may `select/insert/update/delete` only where `id = auth.uid()`.
- **`public.cases`:** users may `select/insert/update/delete` only where `user_id = auth.uid()` (the FK column name is arbitrary; `user` is avoided because it is reserved in PostgreSQL).

No policy grants access to other users’ rows. Even if the client sent another `user_id`, inserts/updates would fail RLS checks.

### Account deletion (reuse the same email)

- **In-app “Delete my logbook data”** calls the Edge Function **`delete-auth-user`**, which uses the **service role** only on the server to remove the **Auth user**. Because `public.users` and `public.cases` reference `auth.users` with `ON DELETE CASCADE`, those rows are removed automatically when the Auth user is deleted, so the email can sign up again.
- **Deploy the function** (from repo root, with [Supabase CLI](https://supabase.com/docs/guides/cli) installed and linked to your project):

```bash
supabase functions deploy delete-auth-user --project-ref YOUR_PROJECT_REF
```

Supabase-hosted functions receive `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` automatically; do **not** put the service role key in the frontend.

- **If the function is not deployed**, the app still deletes `cases` and `public.users`, then signs you out, and shows a notice on the sign-in screen. To free the email, either deploy the function and delete again, or remove the user under **Authentication → Users** in the Supabase dashboard.

Document this for GDPR operational procedures.

## Environment variables

Copy `.env.example` to `.env`:

- `PUBLIC_SUPABASE_URL`
- `PUBLIC_SUPABASE_ANON_KEY`

Never add the **service role** key to the frontend or to `PUBLIC_*` vars.

## Local development

```bash
npm install
npm run dev
```

Open `http://localhost:4321/` for marketing pages and `http://localhost:4321/app/` for the app.

```bash
npm run build
npm run preview
```

## Deployment (Cloudflare Pages, Git integration)

1. Connect the repo and set **build command** `npm run build` and **publish directory** `dist`.
   - No `wrangler` CLI is required for this flow.
2. Add the same `PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_ANON_KEY` in the host’s environment UI.
3. **Supabase Auth → URL configuration:** add your production site URL and redirect URLs (e.g. `https://your-site.example/app/`).
4. **Password reset:** under **Authentication → URL configuration**, add the same `/app/` URLs to **Redirect URLs** (including `http://localhost:4321/app/` for local dev). The app calls `resetPasswordForEmail` with `redirectTo` set to `{origin}/app/` so the recovery link returns users to the SPA, where they can set a new password.

This project uses **static** output; the SPA-like behaviour lives entirely in React on `/app/`.

## GDPR / data safety

- Stored data is limited to **account**, **preferences**, and **case metadata** you enter.
- **PDFs are generated in the browser** (jsPDF). They are not uploaded.
- **Exports** (CSV/JSON) are generated locally.
- **Hard deletes** for cases; full account removal from Settings when the Edge Function is deployed (see above).
- Default deployment ships **without analytics**.

Trainees should still follow local information governance policies.

## Known limitations (MVP)

- **Email confirmation:** if enabled in Supabase, sign-up may not create a session until the user confirms email.
- **Reports:** PDF generation loads up to **8,000** cases in the selected date range; narrow ranges on large logbooks.
- **Offline:** drafts are stored in `localStorage`; there is **no** full offline sync engine.
- **Identifier detection** in notes is heuristic and **not** a guarantee of compliance—users must follow the in-app warning.

## Future Capacitor (iOS / Android)

- Keep using the **static** site + React bundle; wrap the hosted origin or ship the `dist/` assets in a Capacitor `WebView`.
- Re-use the same Supabase anon key + RLS; add your mobile app’s custom scheme to Supabase **redirect URLs**.
- For **push** or **background sync**, treat those as separate, optional phases—avoid scope creep in the MVP.

## Scripts

| Command          | Action              |
| ---------------- | ------------------- |
| `npm run dev`    | Astro dev server    |
| `npm run build`  | Production build    |
| `npm run preview`| Preview production  |
| `npm run check`  | `astro check` types |

## Licence

See `LICENSE` in the repository.
