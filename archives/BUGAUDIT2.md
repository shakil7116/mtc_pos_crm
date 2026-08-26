# BUGAUDIT2.md — Phase 6 Bug Hunt & Flexibility Audit
Mamun M Trading and Contracting WLL — MTC POS & CRM

Method: multi-lens review of code + **live-server probes** on http://localhost:5050 (findings marked ✓verified were reproduced against the running system). Priority: P0 = money/data corruption or crash; P1 = broken feature / spec violation; P2 = friction/inflexibility; P3 = polish.

| # | Module | Type | Issue | Priority | Fix |
|---|--------|------|-------|----------|-----|
| 1 | Documents / Returns | Business Logic Gap | ✓**CN document created via the editor moves stock with NO approval** — salesman POST `type:CN` → stock re-credited immediately (probe F: 0→1). Violates rule 21 (Credit Note never processes without admin/manager approval). The approval gate only guards the `/api/returns` path; the `createDocument` CN branch (storage.ts ~500) bypasses it. | **P0** | Remove auto stock re-credit from `createDocument` CN branch, OR block CN/RV creation via the generic doc route for non-managers and route all customer returns through the pending→approve flow. |
| 2 | Expenses | Bug (authz) | ✓**No role gate on expense write**: driver POST `/api/expenses` → 201 (probe D); salesman PUT `/api/expenses/:id` → 200 (probe E). Only DELETE was gated. Any role can add/alter spend. | **P1** | Gate POST/PUT `/api/expenses` to admin/manager (staff may be allowed to *submit* but not edit — decide; spec says admin/manager for corrections). |
| 3 | Cash Flow / Dashboards | Bug | ✓**Demo-mode invoices pollute the cashflow ledger** (probe C): a `transactionMode:demo` invoice's cash payment writes a real cash-in row → skews cash position & business summary. `createDocument`/`createPayment` log cashflow without checking demo mode. | **P1** | Skip `logCashflow` when `transactionMode === 'demo'`; exclude demo from `getCashPosition`. |
| 4 | Inventory / Settings | Flexibility Gap | Product form category & unit are **free-text `<Input>`**, not driven by the `product_categories` / `product_units` managed lists (no managed-list consumption found in client). Admin can seed lists but the product form ignores them. Spec 11B: these must be admin-managed dropdowns. | **P2** | Feed category/unit from `/api/lists/product_categories` + `product_units` (combobox: pick existing or type new → offer to add to list). |
| 5 | Settings / Custom Fields | Flexibility Gap | **Custom fields (11C) not consumed by any form** — `field_definitions` table + API exist, but no product/customer/invoice/expense form renders them (no `field-definitions` reference in client pages). Spec calls this the "most critical architectural requirement" and it's dormant on the UI side. | **P2** | Render field-definitions for each module on its form (Text/Number/Date/Dropdown/Checkbox/File), persist into the entity `customData` bag, show in list/export. |
| 6 | Settings | Flexibility Gap | **Managed lists have no admin CRUD screen** — units, product categories, sub-locations etc. are editable only via API / the location + expense inline editors. No central Settings "Lists & Categories" (11B) panel. | **P2** | Add a Lists & Categories accordion in Settings iterating known list keys with add/edit/delete (reuse the LocationHierarchy LevelEditor pattern). |
| 7 | Reports | Bug | Business-summary "returning customers" counts only customers created strictly before the period start; customers with no `createdAt` are dropped. Minor undercount on legacy rows. | **P3** | Treat null `createdAt` as returning if they have prior invoices; or document the definition. |
| 8 | Auth (all) | Bug (hardening) | Role/identity still via spoofable `x-user-role`/`x-user-id` headers (known backlog #1). Every gate added this phase is advisory until real sessions land. | **P1 (deferred)** | JWT/session auth before Go-Live — already logged; re-affirm as Go-Live blocker. |

## Verified-OK (probed, no bug)
- `/api/users` does **not** expose PINs (probe A).
- PUT invoice with a duplicate number → 500, rejected (probe B) — numbering integrity holds.
- RV documents via editor do not move stock (probe G) — consistent with the documented dual-model.
- Void role gate, credit-limit server gate, return refund split, corrections authz (staff 403) — all verified in Phase 4/6 smoke suites.

## Notes on scope
Multi-agent audit workflow hit the session limit mid-run (2 of 8 lenses returned before cutoff); this audit was completed inline by direct live-probing the highest-risk paths (money, approval, authz, flexibility). Remaining lenses (deep filter/CSV edge cases, full mobile sweep) fold into Agent 7 verification + the standing hardening backlog.
