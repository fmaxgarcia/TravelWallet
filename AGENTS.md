# Repository Guidelines

## Stack Overview
This project targets a Python-first stack with a hosted Postgres backend:

- Backend API: FastAPI + Pydantic + SQLAlchemy (Alembic for migrations)
- Database: Supabase Postgres (free tier) with local SQLite for offline dev
- Frontend: React + Vite (TypeScript optional)

## Project Structure & Module Organization
- `backend/app/` FastAPI app, routers, domain services, and DB code
- `backend/alembic/` database migrations
- `backend/tests/` pytest suite mirroring `backend/app/`
- `backend/pyproject.toml` backend dependencies and tooling config
- `frontend/src/` React components, routes, and client logic
- `frontend/public/` static assets
- `docs/` architecture notes and decisions
- `scripts/` one-off dev utilities
- `.env.example` root environment template (copy to `.env`)

Keep features cohesive: each domain module owns its schemas, services, and tests.

## Build, Test, and Development Commands
Backend (run from `backend/`):
- `uv sync` install dependencies
- `uv run uvicorn app.main:app --reload` start API locally
- `uv run pytest` run tests
- `uv run ruff check .` lint
- `uv run ruff format .` format
- `uv run alembic upgrade head` apply migrations

Frontend (run from `frontend/`):
- `npm install` install dependencies
- `npm run dev` start Vite dev server
- `npm run build` build production assets
- `npm run test` run Vitest
- `npm run lint` run ESLint/Prettier
- `npm run format` format with Prettier

Supabase config (root `.env`, `backend/.env`, or `frontend/.env`):
- Backend: `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`
- Frontend: `VITE_API_BASE_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`

## Coding Style & Naming Conventions
- Python: 4 spaces, type hints, `snake_case` functions, `PascalCase` classes.
- Frontend: 2 spaces, `camelCase` vars, `PascalCase` React components.
- Prefer `ruff` for Python formatting/linting and `eslint` + `prettier` for web.

## Testing Guidelines
- Backend: `pytest`, name tests `test_<module>.py` in `backend/tests/`.
- Frontend: `vitest`, name tests `*.test.tsx` near components.
- Add integration tests for DB-heavy paths; note any gaps in PRs.

## Commit & Pull Request Guidelines
No Git history is present yet. Use Conventional Commits:
- `feat: add transaction ingestion`
- `fix: handle empty category list`
- `docs: document local setup`

PRs should include a summary, tests run, and screenshots for UI changes.

## Security & Configuration
- Never commit secrets; provide `.env.example` files instead.
- Only expose Supabase anon keys in the client; keep service keys server-side.

## Agent Instructions
- When code changes are made, provide a per-file summary of what changed and why; do not include full diffs.
