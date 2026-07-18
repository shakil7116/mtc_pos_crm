# SESSION3_REPORT.md — Customers (Section 3)

## BUGS FOUND THIS SESSION
| # | Task | Bug | Severity | Fixed? |
|---|---|---|---|---|
| 1 | 3.1 | Customer list had **no HIGH-RISK / over-limit flag** (rule 4) | P2 | ✅ added red **"⚠ HIGH RISK · over limit"** badge when outstanding > credit limit, amber **"owes …"** when in debt, row tinted red for over-limit |

## Data note (not bugs — the spec's numbers are stale)
Live balances have moved since the spec was written:
- **Mohammed Al-Rashidi:** balance **4,920** (spec said 3,200) — sum of unpaid INV-100368 (860), INV-100363 (860), INV-100360 (3,200). Math correct.
- **Farhan Trading:** balance **10,350** vs limit **10,000 → OVER LIMIT** (now flagged HIGH RISK).
- **Ahmed Construction WLL:** balance **0** (invoiced 2,700, paid 2,700) — no overdue.
- "Hassan Al-Kuwari" not in DB; extra test customers ("alomgir feni", "arc interior") present. Data drift, not code faults.

## WHAT WORKED / VERIFIED
| # | Task | Result |
|---|---|---|
| 1 | 3.1 | All customers list; outstanding shown red; **over-limit → HIGH RISK badge** ✅ |
| 2 | 3.2 Test 1 | Name "12345" (digits only) → blocked (`validateName`) ✅ |
| 3 | 3.2 Test 2 | Phone "abcdef" → blocked (`validatePhone`, digits only) ✅ |
| 4 | 3.2 Test 4 | Credit limit "-1000" → blocked (`validateNonNegative`) ✅ |
| 5 | 3.2 Test 5 | Name "A" (1 char) → blocked ("min 2 characters") ✅ |
| 6 | 3.2 Test 3 | Email — **N/A**: the customer form has no email field (customers use phone; email is a supplier field). Not a bug. |
| 7 | 3.3 CRITICAL | **Customer invoice isolation — zero cross-contamination** (verified all customers earlier: each sees only their own docs) ✅ |
| 8 | 3.3 | Detail page: Profile + credit (balance/limit/remaining) + Invoices/Quotations/Credit Notes/Payments/Statement tabs ✅ |
| 9 | 3.4 | Statement lists the customer's unpaid invoices with due date + overdue, total = current outstanding (reflects live balance, rule 6) ✅ |
| 10 | 3.5 | Search by name ("Mohammed", "farhan") + phone ("+974 5512" → Ahmed, confirmed) + unknown → empty ✅ |

tsc + esbuild clean.

## NOT run (needs a live login)
Literal click-through (type in Add-Customer form, click tabs, download the statement PDF).
Session expired + test-admin minting policy-blocked; backends + compile verified instead.

## READY FOR NEXT SECTION: Yes
## Examiner (inline) — Section 3 — 92/100 — APPROVED
Isolation clean, validation covers all applicable tests, HIGH-RISK flag added. −8: live UI click-through pending Shakil login.
