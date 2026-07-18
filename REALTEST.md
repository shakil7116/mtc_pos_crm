# REALTEST.md — Real Store 1 Workflow Test

7 real building-materials scenarios run as salesman/manager/driver via JWT auth on the live server.

**Result: 26/26 checks passed.**

| Scenario | Step | Expected | Actual | Pass/Fail |
|---|---|---|---|---|
| S1 | cash invoice created + paid + sequential | 201 paid INV- | INV-100367 paid | ✅ Pass |
| S1 | total = 320 (5*28+2*45+10*9) | 320 | 320 | ✅ Pass |
| S1 | stock deducted from Store 1 (cement -5, white -2, valve -10) | correct | cem 100->95, wht 100->98, av 293->283 | ✅ Pass |
| S1 | cash payment recorded | Cash | Cash | ✅ Pass |
| S1 | cost price NOT in customer doc payload | no cost field | leak=false | ✅ Pass |
| S2 | credit invoice unpaid | 201 unpaid | INV-100368 unpaid | ✅ Pass |
| S2 | total 860 | 860 | 860 | ✅ Pass |
| S2 | customer history isolated (all his) | all Mohammed | 3 docs all his=true | ✅ Pass |
| S2 | appears in aging report | Mohammed present | found=true | ✅ Pass |
| S3 | split → partial | 201 partial | INV-100369 partial | ✅ Pass |
| S3 | PDC in tracker w/ correct date+bank | 112233 QNB | {"cheque_number":"112233","bank_name":"Qatar National Bank","cheque_date":"2026-08-05T21:00:00.000Z","type":"receivable","status":"pending"} | ✅ Pass |
| S3 | cash portion in cash flow (PDC not yet) | 1 in-row (600) | 1 rows | ✅ Pass |
| S4 | total = 1150 (100*9 + 10*25) | 1150 | 1150 | ✅ Pass |
| S4 | online transfer ref+account saved | TRF2026001 + IBAN | {"method":"Bank Transfer","account_number":"QA12QNBA000012345","reference":"TRF2026001","bank_name":"Qatar National Bank"} | ✅ Pass |
| S4 | line discount stored on item (100) | 100 | 100 | ✅ Pass |
| S5 | return created pending (needs approval) | pending | pending | ✅ Pass |
| S5 | manager approve → stock +3 | approved +3 | approved, valve 283->286 | ✅ Pass |
| S5 | refund is CASH (never PDC) | Cash | Cash | ✅ Pass |
| S5 | NO PDC cheque created for return | 0 cheques | 0 | ✅ Pass |
| S5 | credit note linked to original invoice | orig 8 | 8 | ✅ Pass |
| S6 | void: status void, number kept, stock +2 | void +2 | void, INV-100371===INV-100371, cem 93->95 | ✅ Pass |
| S6 | cash refund processed on void | Cash refund | Cash | ✅ Pass |
| S7 | delivery invoice created (credit, manager override) | unpaid site | INV-100372 unpaid deliver_site | ✅ Pass |
| S7 | driver sees the delivery | listed for driver 5 | 1 deliveries, has=true | ✅ Pass |
| S7 | driver payload strips pricing | total null for driver | total=null | ✅ Pass |
| S7 | mark delivered → status + auto DN | delivered + DN | status=delivered, DN=DN-297333 | ✅ Pass |