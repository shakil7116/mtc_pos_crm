# DOCTEST.md — Real Document Lifecycle Tests (Store 1 — Najma Street)

Run by scripts/doctest-phase7.mjs against live server + real seeded inventory/customers.

**Result: 9/9 tests passed.**

| Test | Expected | Actual | Pass/Fail |
|------|----------|--------|-----------|
| T1 Cash invoice | created, paid, stock −10, sequential # | INV-113364 status=paid, angle-valve 293→283 | ✅ Pass |
| T2 Credit invoice | unpaid, within limit | status=unpaid #INV-113365 | ✅ Pass |
| T3 Split cash+PDC | partial + receivable cheque tracked | status=partial, cheque={"status":"pending","type":"receivable"} | ✅ Pass |
| T4 Delivery invoice | DN auto-generated on delivered | DN=DN-297341 | ✅ Pass |
| T5 Quotation | QT #, draft, stock NOT moved | QT-197243 status=draft, ppr 150→150 | ✅ Pass |
| T6 Convert QT→INV | QT converted, INV created | QT status=converted, new INV=INV-113368 | ✅ Pass |
| T8 Return < 5000 → cash | approved, refund Cash (not PDC) | status=approved, refund=Cash | ✅ Pass |
| T9 Void invoice | VOID kept, stock reversed +5, cash refund | status=void, gloves 195→200 | ✅ Pass |
| Cost price not in customer document payload | no cost field on items | leaks=false | ✅ Pass |