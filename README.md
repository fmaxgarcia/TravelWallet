# TravelWallet

TravelWallet is a travel hub that keeps reservations, loyalty details, and boarding passes in one place. The goal is to let frequent travelers avoid juggling multiple airline and hotel apps by providing a single login and unified view of upcoming trips.

## Run the app locally

### Prerequisites
- Node.js 18+
- Python 3.10+
- `uv` (for Python dependencies)

### Frontend
```bash
cd frontend
npm install
npm run dev
```
Open `http://localhost:5173`.

### Backend
```bash
cd backend
uv sync
UV_CACHE_DIR=.uv-cache uv run uvicorn app.main:app --reload
```
API runs on `http://localhost:8000`.

### Environment variables
Create `frontend/.env`:
```bash
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<publishable-key>
```

Create `backend/.env`:
```bash
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_ANON_KEY=<publishable-key>
```

## Notes
- Supabase email confirmation should be disabled for MVP testing.
- The homepage currently uses synthetic data from `frontend/src/data/home.json`.
