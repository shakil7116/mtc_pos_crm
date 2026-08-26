# Connections

Every external system this app talks to, what breaks without it, and where it is
configured. Keep this current — an integration nobody documented is an outage
nobody can diagnose.

Legend: **Required** = the app does not work without it. **Optional** = a feature
degrades gracefully. **Configured** = currently present in `.env` on this machine.

---

## Required

### PostgreSQL — Supabase
- **Env:** `DATABASE_URL` · **Configured:** yes
- **Carries:** everything. Products, stock, invoices, payments, cheques, customers,
  suppliers, returns, cashflow, users.
- **Must stay on the Session Pooler host** (`...pooler.supabase.com`, IPv4).
  The direct `db.<ref>.supabase.co` host is **IPv6-only** and dies whenever the
  network has no IPv6 route. This already caused a live outage.
- **Failure looks like:** every request 500s, boot log shows `❌ DB: host not found`.
- **Code:** [server/db.ts](server/db.ts). Pool of 10, SSL on, TCP keep-alive set to
  stop the pooler dropping idle connections under bursty load.

### JWT signing secret
- **Env:** `JWT_SECRET` · **Configured:** yes
- **Carries:** every login session.
- **Failure looks like:** the server refuses to start — `server/auth.ts` throws
  `JWT_SECRET is not set` rather than falling back to a default. That is deliberate.
- **Rotating it logs every user out.**

---

## Optional — degrade gracefully

### Groq
- **Env:** `GROQ_API_KEY` · **Configured:** yes
- **Used for:** voice input parsing, and as the AI Assistant's LLM fallback.
- **Without it:** the Assistant still answers the common questions. The deterministic
  intent router in [server/assistantRouter.ts](server/assistantRouter.ts) handles those
  with no external call at all. Only open-ended questions need the LLM.

### Anthropic
- **Env:** `ANTHROPIC_API_KEY` · **Configured:** no
- **Used for:** an alternative Assistant LLM backend.
- **Without it:** falls through to Groq, then to the deterministic router.

### Twilio
- **Env:** `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`,
  `TWILIO_WHATSAPP_NUMBER` · **Configured:** partly (no WhatsApp number)
- **Used for:** WhatsApp payment reminders and customer messaging.
- **Without it:** the app falls back to `wa.me/` deep links, which open WhatsApp on
  the user's own device. Nothing is auto-sent either way — a human always presses send.

### OCR providers
- **Env:** `OCR_PROVIDER`, `OCR_MODEL`, plus one of `GOOGLE_API_KEY` /
  `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `GROQ_API_KEY` · **Configured:** no
- **Used for:** reading product rows off a photographed or scanned document.
- **Without it:** scan-to-inventory still works for **CSV, TXT and text-PDF**.
  Images are refused with a message naming the env vars that would enable them —
  it does not fail obscurely. See [server/ocr.ts](server/ocr.ts).
- **Note:** OCR only transcribes. Column parsing is deterministic
  ([server/lineParser.ts](server/lineParser.ts)), so the model never invents numbers.

---

## Data leaving the building

When `GROQ_API_KEY` or `ANTHROPIC_API_KEY` is set, the Assistant sends live customer
and stock figures to that provider. Mitigations already in place: the rule-based
router answers common questions with no external call, the system prompt forbids
inventing figures, and `draft_whatsapp` only prepares a message — it never sends.
Worth knowing this is a deliberate choice rather than something that arrives by
default with a key.

**No customer data is sent anywhere else.** Twilio receives only the phone number
and the message a human approved.

---

## Not connected

No payment gateway, no accounting-software sync, no email provider, no error
tracking (Sentry or similar), no uptime monitoring, no automated backups beyond
whatever Supabase's plan provides. **Verify the Supabase backup retention before
go-live** — that is currently the only copy of the business's data.
