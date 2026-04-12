# TravelWallet Project Approach

## Goals and Scope
Build a responsive web app that aggregates travel reservations and loyalty data in one place. MVP is read-only and focused on: (1) email-based reservation ingestion and (2) on-demand account data retrieval for target airlines/hotels. No check-in, payments, or in-app booking in v1.

## MVP User Flows
- Sign up/login (email/password + Google).
- Add airline/hotel credentials.
- Forward confirmation emails; see parsed reservation name/number/dates.
- View dashboard of upcoming trips; click provider tabs for current account info.
- Upload a boarding pass PDF/QR and attach it to a reservation.

## Technical Approach
- Frontend: React + Vite; dashboard + Flights/Hotels tabs.
- Backend: FastAPI + SQLAlchemy + Alembic.
- Data: Supabase Postgres (prod) with SQLite local dev.
- Ingestion: inbound email service -> store raw email -> parser -> reservations.
- Provider access: per-provider connectors using HTTP login flows; manual MFA step when required.
- Security: encrypt credentials at rest (app-level encryption with env-managed key).

## Risks and Constraints
- Provider login automation is brittle and may conflict with terms; maintain clear fallbacks.
- MFA variability; design for manual MFA input and session caching.
- Email format diversity; start with targeted templates and expand iteratively.

## Milestones
1) Auth + UI shell + core data model.
2) Email ingestion and reservation parsing for target providers.
3) Provider connectors with MFA flow.
4) Boarding pass upload + reservation attachment.

## Modular Tickets (Expanded)
T1: Auth and protected routes
- Scope: email/password + Google login via Supabase Auth; route guards.
- Depends on: Supabase project.
- Acceptance: users can sign up/login/logout; protected pages require auth.

T2: Core schema and migrations
- Scope: Users, Providers, Accounts, Reservations, Emails, BoardingPasses, Sessions.
- Depends on: T1.
- Acceptance: migrations applied; CRUD endpoints stubbed and documented.

T3: Credential encryption service
- Scope: app-level encryption for provider credentials; key management via env var.
- Depends on: T2.
- Acceptance: credentials stored encrypted; decrypt works server-side only.

T4: Inbound email pipeline
- Scope: inbound email provider integration; raw email storage; user association.
- Depends on: T2.
- Acceptance: forwarded email lands in DB with metadata and raw body.

T5: Reservation parser v1
- Scope: parse reservation name/number/dates for target providers from emails.
- Depends on: T4.
- Acceptance: parsed reservations appear in API and UI with confidence scoring.

T6: Provider connector framework
- Scope: connector interfaces, session caching, MFA prompt flow, error taxonomy.
- Depends on: T2, T3.
- Acceptance: mock connector runs end-to-end with stored credentials + MFA stub.

T7: Airline connectors v1
- Scope: Delta, American, United, Aerolineas Argentinas account summary fetch.
- Depends on: T6.
- Acceptance: account summary displayed in UI; errors mapped to user-friendly states.

T8: Hotel connectors v1
- Scope: Marriott, Sheraton, Hyatt account summary fetch.
- Depends on: T6.
- Acceptance: account summary displayed in UI; errors mapped to user-friendly states.

T9: Dashboard + provider pages
- Scope: dashboard lists upcoming trips; provider tabs show account info.
- Depends on: T5, T7, T8.
- Acceptance: loading/empty/error states; responsive layout.

T10: Boarding pass upload
- Scope: upload PDF/QR; attach to reservation; basic download/view.
- Depends on: T2.
- Acceptance: pass stored and retrievable; UI shows attachment status.

## Open Decisions
- Email ingress provider (Postmark, SendGrid, Mailgun).
- Legal/terms review for automated logins; define fallback behavior.

## Owner Setup Checklist (Needed to Complete Tickets)
- Supabase project with Auth enabled and a Postgres DB.
- Google OAuth client (client ID/secret) configured in Supabase Auth.
- Email ingress provider account (Postmark/SendGrid/Mailgun) + inbound domain.
- DNS updates for inbound email (MX + SPF/DMARC as required).
- A stable public URL for inbound email webhooks (staging domain or tunnel).
- Encryption key for credentials (32-byte base64 or hex), stored as env var.
- Optional: object storage bucket for boarding passes (Supabase Storage or S3).
