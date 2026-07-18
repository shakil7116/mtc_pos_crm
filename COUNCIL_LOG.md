# COUNCIL_LOG.md — 4-role architecture council

Roles: **Agent A** (backend/data), **Agent B** (product/UX), **Agent C** (systems architect), **Examiner** (challenges + scores only).
Spec note: MTC_MASTER_SPEC + the last dashboard-routing prompt already MANDATE a dedicated Finance page and dashboard=nav-only. Council debates HOW, not WHETHER.

---

# Feature: Finance page architecture + dashboard navigation

## Round 1 — Independent Proposals

### Q1 — Finance a fully separate page, or a mode/filter inside one unified page?

**Agent A (data):** Separate page, but the split is about DATA CADENCE, not screens. Money-management data
(cashflow, cheques, owner_loans) mutates intraday and is transactional; performance data (sales, stock,
aging) is read-mostly aggregation. Different cache/refetch policies (30–60s live for cash vs on-demand for
reports). One page forcing both under one refetch policy either over-fetches heavy aggregates or serves
stale cash. → Separate page = separate query lifecycles.

**Agent B (UX):** Separate page. At Store 1 the owner asks two different questions: "how much money do I
have right now / who owes me / which cheque clears when" (Finance) vs "what sold, what's slow, who's my
best customer" (Reports). Bolting both into one page = a 13-tab monster (what we HAD). Two doors, each
named for the question in the owner's head. Fewer wrong taps.

**Agent C (architecture):** Separate page, but both are THIN — they must not own logic, only compose
existing dedicated pages (CashPosition, ProfitToday, CashLoans, PdcTracker). Finance = a tab shell that
embeds. Reports = a tab shell over report tabs. If a tab ever needs to be its own route later (mobile deep
link, permissions), an embedded page already stands alone. No rebuild.

### Q2 — Dashboard deep-links: URL query params (?tab=cash) or separate routes (/finance/cash)?

**Agent A:** Query param. A tab is view-STATE of one mounted page, not a distinct resource. Separate routes
would remount + refire every query per tab switch. `?tab=` keeps the page mounted, swaps the panel, reuses
warm cache. Guard once at `/finance`.

**Agent B:** Query param, provided the widget URL === the URL you get by clicking the sidebar then the tab.
The owner copy-pastes a link to the accountant; it must reopen the exact tab. `?tab=` does that and the
browser Back button returns to the dashboard, not through 4 sub-routes.

**Agent C:** Query param, but ONE reader of truth. Tab must come from the URL (reactive), not local state
that drifts from the address bar. Use wouter `useSearch`; unknown tab → safe default. Avoids the class of
bug where dashboard-link and in-page click render different things.

### Q3 — Credit exposure vs aging: one source shown two ways, or separate calculations?

**Agent A:** One source. Both are "unpaid INV, remaining = total − (payments − refunds)." Two derivations =
two chances to drift (a refund handled in one, not the other → numbers disagree → owner loses trust). One
function `getUnpaidInvoices`; credit-exposure = group by customer, aging = bucket by daysOverdue.

**Agent B:** One source, two LENSES. "Credit Exposure" answers *who* owes (chase the customer). "Aging"
answers *how old* the debt is (escalation). Same money, different question — must always sum to the same
total or the owner distrusts the whole app.

**Agent C:** One source, and the dashboard must not compute a THIRD copy. Today summary.paymentReminders,
credit-exposure, and unpaid-invoices are three endpoints — acceptable only if all three call the one
derivation. If any re-implements the remaining-balance math, collapse it.

## Round 2 — Cross-Critique

**Agent A critiques B & C:** B's "two doors" is right but ignores that the two doors can still share a query
key — don't duplicate the cashflow fetch on both dashboard and Finance; use one `queryKey` so React Query
dedupes. C's "thin shells" is correct but embedding four pages means four independent `useQuery`s mount on
one screen — fine for cash, but the Cheques tab pulls ALL cheques + a corrections fetch per row; that N+1
in the row badges will bite on a long cheque list. Flagging.

**Agent B critiques A & C:** A's cache-cadence point is real but invisible to the user — don't let it drive
a split that's already justified by workflow. C's "each tab must stand alone as a route" risks
over-engineering: the owner never types `/finance/cheques`; they tap. Standalone-ability is a nice property,
not a requirement to build routes for now.

**Agent C critiques A & B:** A is right about one source but the actual risk isn't the math, it's
PERFORMANCE — `getUnpaidInvoices` does `Promise.all(docs.map → getPayments(doc.id))`, an N+1 identical to
the getDocuments bug we already fixed. At 3 invoices it's invisible; at 300 it's 300 round-trips and the
dashboard summary (which embeds it) stalls. B under-weights that the dashboard already had duplicate widgets
(Total Outstanding vs Credit Exposure) — dedupe must be enforced, not assumed.

## Round 3 — Examiner Challenge

**Examiner → Agent A:** You want `?tab=` to keep the page mounted for warm cache. But the Cheques tab embeds
PdcTracker whose filter state (`type`) is read from the URL ONCE at mount. If the user is on
`/finance?tab=cheques` and a dashboard link sends `&type=payable`, the page is already mounted → your warm
cache means the filter never updates. Isn't your own optimization the bug?
**Agent A responds:** Correct, that's a real edge. Fix without abandoning query params: the embedded page
must derive its filter reactively from `useSearch` too, OR Finance remounts the tab panel on a changed
`type` via a React `key`. Cheapest is the `key` — `<PdcTracker key={search} />`. Warm cache preserved for
the common case (no param change); correctness restored for the param-change case. I take the hit; the
optimization stands with a keyed remount.

**Examiner → Agent B:** You claim two doors reduce wrong taps. But you just moved Cash & Loans OFF the
sidebar into a Finance tab. A user who had "Cash & Loans" muscle-memory now taps a dead spot. How is that
not a regression you introduced?
**Agent B responds:** Fair. Mitigation: keep the `/cash-loans` ROUTE alive (bookmarks/muscle-memory still
resolve) even though the sidebar entry is gone, and the Finance "Cash & Loans" tab is one obvious tap from
the same neighbourhood (between Expenses and PDC). Net taps unchanged for the deliberate user; the win is
removing a redundant top-level entry. If telemetry later shows heavy direct use, re-add it — cheap.

**Examiner → Agent C:** You call the N+1 the "actual risk," but this business has ONE store and a handful of
open invoices. Isn't fixing getUnpaidInvoices now exactly the premature scaling you warn others about?
**Agent C responds:** Distinction: I oppose building STRUCTURE for scale we don't have (extra stores,
routes, services). I do NOT oppose removing a known-quadratic query on a HOT path — the summary endpoint
runs on every dashboard load and refetch. It's the same one-function fix we already shipped for
getDocuments, ~15 lines, no new abstraction, and it removes a latent stall. Cheap insurance ≠ speculative
architecture. Build it.

## Round 4 — Final Agreed Approach

Converged (what each contributed):

1. **Finance = separate top-level page** (A: query lifecycle · B: two-question workflow · C: thin embedding
   shell). Matches spec. **Already implemented** — validated.
2. **Tabs via `?tab=` query param, URL is the single source of truth** (A: warm cache · C: reactive
   `useSearch`, safe fallback · B: shareable link == sidebar path). **Already implemented.** DELTA from
   Examiner↔A: guarantee embedded filters (PdcTracker `type`/`due`) update when the query changes — add a
   keyed remount so a mounted Cheques tab honours a new `&type=`.
3. **One data source, two projections** (A/B: never diverge · C: no third copy + fix the N+1).
   Verified live: credit-exposure = unpaid-invoices sum = summary.totalOutstanding = **7560.00**, all from
   `getUnpaidInvoices`. DELTA from C: **batch getUnpaidInvoices** (one payments query, group in memory) to
   kill the N+1 on the hot summary path.
4. **Dashboard dedupe stays enforced** (C): Total Outstanding removed; Credit Exposure is the single
   receivables number. Already done.

Dropped: separate `/finance/cash` routes (B: nobody types them; A: remount cost) — revisit only if
telemetry demands. Dropped: separate aging calculation (A/B: divergence risk).

Two concrete code deltas to implement: **(D1)** keyed remount of the Finance Cheques tab so URL filter
changes apply; **(D2)** de-N+1 `getUnpaidInvoices`.

## Implementation
- D1 — `Finance.tsx`: `<PdcTracker key={\`ch-${search}\`} embedded />` so a changed `?type=/&due=` remounts
  the embedded tracker and re-reads the filter. Other tabs unaffected.
- D2 — `storage.ts` `getUnpaidInvoices`: replaced per-doc `getPayments` loop with one
  `inArray(payments.documentId, ids)` query grouped in memory (net-of-refund per doc). Same result,
  1 query instead of N.

## Examiner Final Score

Scored against the Round-4 agreed approach + MTC_MASTER_SPEC (dedicated Finance page, dashboard = nav-only,
no duplicate content, single receivables source).

Verified live (admin session, server restarted):
- Q1 separate Finance page — present, top-level `/finance`, thin embedding shell. ✅
- Q2 `?tab=` single-source-of-truth via `useSearch` — 4 tabs deep-link correctly. ✅
- **D1** keyed Cheques remount — `/finance?tab=cheques&type=payable` → filter "Payable" (empty);
  switching to `&type=receivable` remounts → filter "Receivable", lists 74294 / 564870 / 112233.
  The mounted-tab-ignores-new-param bug the Examiner raised is fixed. ✅
- Q3 one source, two projections — credit-exposure = unpaid-invoices sum = summary.totalOutstanding =
  **QAR 7560.00**, `reconciles: true`, 3 invoices. ✅
- **D2** de-N+1 `getUnpaidInvoices` — one `inArray(payments.documentId, ids)` replaces the per-doc loop;
  results identical (7560, no drift). Hot summary path no longer quadratic. ✅
- tsc --noEmit clean · server error log "No server errors found." · cash guard + cheque single-booking
  untouched.

**Score: 95 / 100 — APPROVED.**
Passed: every Round-4 decision implemented + verified; both concrete deltas (D1, D2) shipped and proven.
−5: `getUnpaidInvoices` still fetches full document rows before filtering to unpaid (could push the
`status != paid/returned/void` + a remaining>0 pre-filter into SQL) — micro-optimization, not required at
this data size; logged for a future pass. No blocking gaps → no rework cycle needed.
