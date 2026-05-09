<div align="center">
  
  ## Surgical eLogbook

  An operative training logbook built by surgeons, for surgeons. Capture cases in seconds, filter your experience, and generate portfolio-ready PDF reports without uploading patient data.

  <sup>Educational tool only. Users are responsible for local governance and information-security compliance.</sup>
  
</div>

### Key Features

#### ⚡ 1. Log cases in seconds
- Record date, trust, specialty, CEPOD, consultant, role, and operation tags
- Star frequent defaults so repetitive entries take fewer taps
- Keep notes optional, with clear prompts to avoid identifiers

<div align="center">
  <img src="https://github.com/user-attachments/assets/e8ee0b82-ff97-4e69-a9b4-2e307b919d1e" width="75%" alt="Surgical eLogbook case form">
</div>

#### 📋 2. Review your experience properly
- Filter by specialty, trust text, CEPOD, and role
- Adjust visible columns to match your workflow
- Sort and paginate cleanly for portfolio preparation

<div align="center">
  <img src="https://github.com/user-attachments/assets/5d74903e-aafd-465e-8ecb-65cee9d63f1e" width="75%" alt="Surgical eLogbook cases table">
</div>

#### 📈 3. Build portfolio-ready reports
- Use quick date presets from 6 months to all-time
- Add specialty filters and pick PDF layout style
- Include GMC and grade lines when needed

<div align="center">
  <img src="https://github.com/user-attachments/assets/7ef22eb0-091c-407a-90f6-41bd9721d9e4" width="75%" alt="Surgical eLogbook PDF reports">
</div>

#### 🔒 4. Privacy-first by design
- PDFs are generated in-browser in normal app flow
- CSV/JSON exports are generated locally
- Supabase RLS isolates each user account's data

<div align="center">
  <img src="https://github.com/user-attachments/assets/9d3f6722-1862-4447-8c97-96bc9d0a0137" width="35%" alt="Surgical eLogbook mobile view">
</div>

### 🛠️ Tech Stack

- **Frontend:** Astro + React + Tailwind
- **Auth + DB:** Supabase (Postgres + RLS)
- **Exports:** Client-side PDF/CSV/JSON
- **Deploy:** Cloudflare Pages

### 🤝 Contributing

This is a finished project. Contributions, issues, and feature requests are welcome.

### 📄 License

See `LICENSE` in this repository.

### 🔐 Security Notes (Public Deployment)

- Never commit secrets (`SUPABASE_SERVICE_ROLE_KEY`, SMTP keys, provider tokens). Keep them only in host-managed environment variables.
- Set Edge Function origin allowlist via `ALLOWED_ORIGINS` (comma-separated, e.g. `https://surgicalelogbook.com,https://www.surgicalelogbook.com`).
- Keep Supabase Auth password policy strong (length + complexity) and enable secure password change.
- Keep dependencies up to date and review `npm audit` before releases.
