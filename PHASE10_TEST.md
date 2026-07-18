# PHASE10_TEST.md — Integration & Final Test (Store 1 — Najma Street)

A full business day run against the live server (JWT auth, real Singapore DB, real
products) exercising every Phase 10 change in sequence. Executed by a consolidated
script using a throwaway admin, with complete teardown afterward — **inventory was
restored to its exact starting value and no test rows remain**.

| Time | Action | Expected | Actual | Pass/Fail |
|---|---|---|---|---|
| 08:00 | Admin opens dashboard — cash position | ≥ opening balances (13,000), never a false negative | total = 13,863.50 | ✅ Pass |
| 09:00 | Cash sale: 100 × 15, QAR 1/unit line disc + QAR 400 footer disc | line total **1,400**, footer **400**, grand **1,000** | subtotal 1,400 · discount 400 · total 1,000 | ✅ Pass |
| 12:00 | Credit invoice with **Deliver to Site** | DN auto-generated at save, linked, `pending_pick` | DN #32 linked, pending_pick | ✅ Pass |
| 12:01 | Driver tries to deliver before authorisation | **blocked** (must be authorised first) | HTTP 400 rejected | ✅ Pass |
| 12:05 | Warehouse **pick** → manager **authorize** → driver **deliver** | DN + invoice both marked delivered | invoice deliveryStatus = delivered | ✅ Pass |
| 14:00 | Customer returns 1 item → manager approves | stock reversed, **cash refund, no PDC**, **Credit Note generated + linked** | CN #33 (type CN, linked to invoice), 0 PDC cheques | ✅ Pass |
| 16:00 | Quick Sale — walk-in, cash | paid invoice, stock deducted, cash booked | invoice #34 status paid | ✅ Pass |
| 21:30 | Admin runs Business Summary | charts (7-day daily sales + category pie) + recommended actions | dailySales[7], 7 categories, 7 actions | ✅ Pass |

**Result: 8/8 integration checks pass.** Every confirmed bug (footer-discount display &
math, DN auto-generation, credit-note/return P0) and every approved build (Quick Sale,
product detail, report charts) works together in one real business-day flow.

### Cross-feature integrity confirmed
- The footer-discount invoice math is exactly the spec's example (1,400 → 1,000), and a
  **return on that same invoice** produced a correct Credit Note with cash refund and no PDC.
- The DN authorization **gate** genuinely blocks an out-of-order delivery (HTTP 400).
- Opening balances keep the cash position positive; a genuine overdraft would show RED.
- Teardown restored `Angle Valve 1/2 inch` stock to its starting count — the harness left
  the database exactly as it found it.

Per-agent verification detail (11/11, 13/13, 3/3, etc.) is recorded in EXAMINER_LOG.md.
