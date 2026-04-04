# Supabase Setup

## 1) Create a project
Create a new project in Supabase and wait for the database to be ready.

## 2) Grab connection details
From the Supabase dashboard:
- Go to **Project Settings > Database** for the connection string.
- Go to **Project Settings > API** for the URL and anon key.

## 3) Configure environment variables
Copy `.env.example` to `.env` (or `backend/.env` and `frontend/.env`) and set values:

```bash
DATABASE_URL=postgresql+psycopg://postgres:password@db.<ref>.supabase.co:5432/postgres
SUPABASE_URL=https://<ref>.supabase.co
SUPABASE_ANON_KEY=your_anon_key
VITE_API_BASE_URL=http://localhost:8000
VITE_SUPABASE_URL=https://<ref>.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key
```

## 4) Local development
You can keep `DATABASE_URL=sqlite:///./travelwallet.db` for local-only work. Switch to
Supabase when you are ready to share data across devices or collaborators.
