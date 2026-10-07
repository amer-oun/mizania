# 001 — Category names stored as `names jsonb` on the category row

- Status: accepted
- Date: 2026-10-04

## Context

PLAN.md §7 defines `categories (id, user_id nullable, key, icon, color, group)`
and asks for default categories with Arabic, French and English names. The
model has no column for the name. Two options:

1. Keep names only in the web app's i18n message files, keyed by `key`.
2. Store the names on the row.

Users will later create their own categories (e.g. "Gym"), which have a name
that no message file knows about. Names also need to reach the API and the
worker (notifications, CSV export), not only the web app.

## Decision

Add `names jsonb NOT NULL` with shape `{ ar, fr, en }` to `categories`.
Default categories (`user_id IS NULL`) carry all three translations from the
seed. User-created categories store the name the user typed (the same value
in all three, or only their locale, decided when that feature is built).

`key` stays the stable identifier for default categories. A partial unique
index guarantees one default per `key`; another guarantees one `key` per user.

## Consequences

- Every client reads the right name directly from the data, online or offline.
- Adding a locale means a data migration, not only a new message file.
- Translations of default categories are reviewed in the seed file, not in
  `apps/web/messages`.
