## Tech Stack

- Go
- Gin
- PostgreSQL
- Vanilla JavaScript
- HTML
- Tailwind CSS
- JWT

## Project Structure

```text
backend/    # Go API and database
frontend/   # Web interface
mockon/     # Seed data
```

## Frontend styling

The UI uses two layers of Tailwind CSS:

| File                                | Role                                                                             |
| ----------------------------------- | -------------------------------------------------------------------------------- |
| `frontend/assets/css/app.css`       | Legacy bundle (preflight, utilities and the original component styles).          |
| `frontend/assets/css/theme.src.css` | Source of the modern design system: tokens, shell, components, calendar, motion. |
| `frontend/assets/css/theme.css`     | Compiled output of `theme.src.css`, loaded after `app.css` on every page.        |

Edit `theme.src.css` (not `theme.css`) and rebuild with:

```bash
bun run css:theme          # one-off build
bun run css:theme:watch    # rebuild on save while designing
```

Both CSS bundles are committed so the static frontend keeps working without a build step.
Presentation lives in CSS; the class strings in `frontend/assets/js/ui.js` only carry
semantic class names.

## QA checks

Run the backend and frontend quality gates from the repository root:

```bash
npm run qa
```

This runs `go test`, `go vet`, ESLint, and Prettier. Database migrations run
automatically when the API starts (`goose up` in `backend/migrations`).

## Inspection workflow

1. `OPEN` — ANGGOTA creates the monthly inspection. The signature is attached on
   creation, or later with `POST /inspections/:id/signatures/anggota`.
2. `SUBMITTED` — the assigned inspector sends the signed draft for review with
   `POST /inspections/:id/submit-approval`.
3. Kepala signs the review with `POST /inspections/:id/signature/kepala-ruangan`
   (only `KEPALA`/`ATASAN_PPI`, only while `SUBMITTED`).
4. `APPROVED` — KEPALA (or SUPER_ADMIN as oversight) approves with
   `POST /inspections/:id/approve`; both signatures are required.

- The petugas slot is available to the assigned inspector. A `KEPALA` may also
  create an inspection and act as its inspector; the kepalas still review and
  approve the submitted record.
- The kepala signature is stored in `inspection_signatures` (`role = KEPALA`) and is
  required before approval.
- Older records submitted without a petugas signature can still be completed while the
  status is `SUBMITTED`; `APPROVED`/`REJECTED` records are locked.
- The API authorises by role and returns no permission list, so `api.js` mirrors the
  role capabilities for the UI (`hasPermission`).

## Audit

- Room-assignment changes and inspection deletions are written to `audit_logs`.
- `GET /audit-logs` lists recent audit entries for `SUPER_ADMIN` and `KEPALA`.
