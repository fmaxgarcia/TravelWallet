# Session Summary

## Project Purpose
TravelWallet is a responsive web app that aggregates travel reservations, loyalty accounts, and boarding passes into one place. The MVP focuses on email-based reservation ingestion and on-demand account data retrieval. V1 is read-only and uses Supabase for auth and storage.

## Current Stack
- Frontend: React + Vite
- Backend: FastAPI + SQLAlchemy + Alembic
- Data: Supabase Postgres (prod), SQLite (local dev)

## What Exists Today
- Auth UI in the frontend with email/password and Google login wired to Supabase.
- Homepage driven by synthetic data from `frontend/src/data/home.json`.
- Tabs for Overview, Flights, Hotels, Passes with tab-specific content.
- Flights/Hotels tabs show filtered loyalty accounts.
- Styling: teal/blue palette, responsive layout, no side marketing cards.
- Hyatt connector now uses a persistent Playwright browser profile instead of replaying login on every sync.
- Marriott connector now uses the same persistent browser-session flow with provider status/connect/sync APIs.
- The backend exposes Hyatt `status`, `connect`, and saved-session `sync` endpoints.
- The backend now supports both Hyatt and Marriott in the provider registry.
- Hotel connector UI now tries Hyatt autosync on startup only when a saved session exists; otherwise it prompts the user to click Sync and opens a headed browser with prefilled details when available.
- Hyatt sync now runs a headless Playwright session first, then falls back to a headed browser only if login is required.
  - The Hotels tab now triggers Hyatt autosync when you open it, and only shows the prefilled sign-in action if the saved session cannot be reused.
  - The Hyatt session status now recognizes the saved browser profile on disk as a usable session, so the Hotels tab should autosync from it on first open.
  - If the opened Hyatt browser is already logged in, the connector now skips login filling and extracts the account overview points directly.
  - The Hyatt card now labels states explicitly as checking saved session, session synced, saved session available, or no saved session.
  - Provider prompts now follow the selected hotel provider (Hyatt or Marriott) with Marriott last name optional.

## Ticket Status
- T1 Auth and protected routes: in progress (UI done; route guards + backend auth pending).
- T2–T10: not started.

## Key Files
- `docs/project-approach.md` for architecture and ticket breakdown.
- `frontend/src/data/home.json` for synthetic homepage data.
- `frontend/src/App.jsx` and `frontend/src/App.css` for UI.
- `backend/app/providers/hotels/hyatt.py` for the Hyatt persistent-session connector.
- `backend/app/providers/hotels/marriott.py` for the Marriott persistent-session connector.
- `backend/app/api/routes/providers.py` and `backend/app/providers/storage.py` for provider state and session metadata.

## Repo State
- Branch: `master`
- Remote: `https://github.com/fmaxgarcia/TravelWallet`
- Issues: T1–T10 created on GitHub.
