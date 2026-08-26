# Decisions log

Why things are the way they are. Newest first. One entry per real decision —
not a changelog, a record of choices that would otherwise get re-litigated.

Format: `## YYYY-MM-DD — Decision` / **Context** / **Decision** / **Why** / **Consequence**

---

## 2026-08-26 — Keep all work on `master`, no feature branches

**Context:** The AI assistant / scan / import subsystem was committed on a branch
`feat/ai-assistant-scan-import`, then fast-forwarded into `master` and the branch deleted.

**Decision:** Solo development stays on a single `master` line.

**Why:** Owner is the only developer. Work parked on a side branch gets forgotten
while `master` moves on, and the two drift apart. Every prior commit is on `master`.

**Consequence:** No merge step to remember. Rollback is `git revert` on a single line.

---

## 2026-08-26 — `stock-import.csv` is gitignored, not committed

**Context:** 30 rows carrying `sale_price` next to `cost_price` for every product,
plus the Store 1 street address on every row. The GitHub repo is public.

**Decision:** Ignore it at repo root (`stock-import.csv` and `/*-import.csv`).
The glob is anchored to `/` so `csv-templates/*.csv` stays tracked.

**Why:** Committing it publishes the full markup structure of the catalogue —
every cost and every margin — to anyone who finds the repo.

**Consequence:** Import files live on disk only. If a future import file genuinely
needs tracking, put it in `csv-templates/` where the anchored glob does not reach.

---

## 2026-08-26 — Repo visibility to be changed to private

**Context:** `github.com/shakil7116/mtc_pos_crm` returns HTTP 200 from the public API.
Full POS source, DB schema, pricing logic and business rules are world-readable.
History was scanned: `.env` was never committed and no secret patterns exist in 40 commits.

**Decision:** Owner makes the repo private before anything is pushed. Commits stay local
until then.

**Why:** No secrets have leaked, but the business logic of a live POS is not something
to publish by default.

**Consequence:** `master` sits 1 commit ahead of `origin` until the visibility change lands.
