# First run — putting a fresh copy on a machine

A new copy of MTC POS has **no accounts in it**. Nobody can sign in, because nobody
exists yet. The first thing to do is create the admin account; from then on that
admin creates everybody else from **Settings → Users**, and the door for creating an
admin without signing in closes for good.

---

## 1. Get the app onto the machine

```bash
git clone https://github.com/shakil7116/mtc_pos_crm.git
cd mtc_pos_crm
npm install
```

## 2. Point it at a database and give it a session key

```bash
cp .env.example .env
```

Then open `.env` and fill in two things. Nothing else is required to start.

| Setting | What it is |
| --- | --- |
| `DATABASE_URL` | The PostgreSQL database. For Supabase use the **Session Pooler** URL (`…pooler.supabase.com`) — the direct `db.<ref>.supabase.co` host is IPv6-only and dies on a network without an IPv6 route. |
| `JWT_SECRET` | The secret that signs login sessions. **The server refuses to start without it.** Generate one: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |

Keep `ALLOW_DEV_HEADERS=0`. With it on, anyone can claim to be an admin by setting a
header.

## 3. Create the tables

```bash
npm run db:push
```

## 4. Start it

```bash
npm run dev      # http://localhost:5050
```

## 5. Create the admin account

Open the app in a browser. Because there is no admin yet, it opens the **setup
screen** instead of the login screen, and walks through:

1. **Your account** — name, email, **username**, password.
2. **Your business** — company name, address, phone, CR number. This is what prints
   on invoices.
3. **Your first store**.
4. **Your team** — optional. Each staff member gets a username and a starting
   password you tell them; they choose their own password and their own 4-digit PIN
   the first time they sign in.

**Write the username down.** The sign-in screen asks for the **username, not the
email**. The last setup screen prints it for exactly this reason.

Right after setup you are asked to set your own **4-digit PIN**. This is not
optional and it matters: the PIN approves discounts, and it is what "Forgot
password?" checks — without a PIN you know, a forgotten password means no way back
into your own system.

## 6. Everybody else

Signed in as the admin: **Settings → Users → Add user**. Give each person a username,
a starting password and a role.

The five roles: `admin`, `manager`, `worker`, `salesman`, `driver`. A manager sees
what an admin sees. A salesman and a worker see their own store only — that scope is
enforced on the server, not in the screen.

---

## If the browser setup screen is not an option

Headless box, no display, or the admin row was lost restoring a backup:

```bash
node scripts/create-admin.mjs
# or, to skip two of the questions:
node scripts/create-admin.mjs shakil "Shakil Gazi"
```

It asks for the password (typed, never echoed, never in the shell history) and
refuses if an active admin already exists.

---

## When it does not work

| What you see | What it means |
| --- | --- |
| **"Database not ready"** on the first screen | The app cannot reach the database, or `npm run db:push` has never run. Steps 2 and 3. |
| Server exits with `JWT_SECRET is not set` | Step 2. |
| Boot log shows `❌ DB: host not found` | `DATABASE_URL` is on the direct Supabase host. Switch to the Session Pooler URL. |
| Login screen instead of the setup screen on a brand-new copy | An admin already exists in that database. `node scripts/create-admin.mjs` will tell you who. If the password is lost: `node scripts/force-password-reset.mjs <username>`. |
| **"An admin account already exists"** during setup | Same thing — sign in as that admin and add users from Settings. |
| Admin exists but the password is gone, and so is the PIN | `node scripts/force-password-reset.mjs <username>` forces a new password on next login. |

## Before real money goes through it

Read `references/GO_LIVE_CHECKLIST.md` and `BACKUP.md`. The backup one before you
need it, not after.
