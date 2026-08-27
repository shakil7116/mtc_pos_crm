# Backup and restore runbook

The database holds the entire financial record of the business: every invoice,
payment, cheque, customer balance and stock level. Before this existed, Supabase's
own retention was the only copy.

Read this **before** you need it. The worst time to learn a restore procedure is
during an outage.

---

## Take a backup

```bash
npm run backup
```

Writes `backups/mtc-<timestamp>.json.gz` — every table, every row, plus all 41
sequence positions. Reads only; it never writes to the database. It verifies the
file by reading it back and comparing row counts before reporting success, and
keeps the newest 14, deleting older ones.

Current size: about **580 KB** compressed (1.4 MB raw) for ~1,900 rows.

```bash
npm run backup -- --keep 30          # keep 30 instead of 14
npm run backup -- --out E:/mtc-bk    # write to a USB stick or another drive
```

### Where the copies live

`backups/` sits inside your OneDrive folder, so every backup syncs to OneDrive
automatically. That is a genuine second copy on different hardware.

It is **gitignored** and must stay that way. The GitHub repo is public, and one of
these files is the whole business.

For a third copy, run with `--out` onto a USB stick occasionally. Two copies in the
same account is not the same as two copies in two places.

---

## Check that a restore would work

```bash
npm run backup:restore-check
```

**Dry run — writes nothing.** It reads the newest backup, connects to the target,
and verifies: every table exists, every column still exists, foreign keys can be
ordered parents-first, and how many rows would be written. If the schema has drifted
since the backup, this tells you before you need it to matter.

Run this after any schema change. A backup that no longer matches the schema is not
a usable backup.

---

## Actually restore

**This is destructive.** It TRUNCATEs every table in the backup and reloads it.
Everything currently in those tables is gone.

```bash
node scripts/restore-db.mjs --confirm
```

It runs inside a single transaction and rolls back completely on any error, so a
failed restore leaves the database as it was.

### Rehearse it somewhere safe first

```bash
node scripts/restore-db.mjs --url postgresql://…scratch-db… --confirm
```

Point `--url` at a scratch database — a second free Supabase project works. **This
has not been rehearsed against a live target yet.** The plan validates cleanly and
the backup file verifies, but a restore you have never actually run is a plan, not
a proven procedure. Do this once when you have an hour and nothing is on fire.

---

## If the database is lost entirely

1. Create a new Postgres (Supabase project, or anything else).
2. Put its **session pooler** URL in `.env` as `DATABASE_URL` — not the direct
   `db.<ref>.supabase.co` host, which is IPv6-only and will fail. See
   [connections.md](connections.md).
3. Recreate the schema: `npm run db:push` — the table definitions live in
   `shared/schema.ts`, which is in git, so the structure is never lost with the data.
4. Check the plan: `npm run backup:restore-check`
5. Restore: `node scripts/restore-db.mjs --confirm`
6. Verify: `npm run test:live` — confirms profit figures compute and reconcile.

---

## Run it automatically

Nothing schedules this yet. To have Windows run it every day at 9pm, in an
**Administrator** terminal:

```bash
schtasks /create /tn "MTC DB Backup" /tr "cmd /c cd /d \"C:\Users\Hp\OneDrive\Desktop\mtc pos crm\" && npm run backup >> backups\backup.log 2>&1" /sc daily /st 21:00
```

Then confirm it is registered:

```bash
schtasks /query /tn "MTC DB Backup"
```

Check `backups/backup.log` occasionally. **A backup job nobody checks is a backup
job that has been failing for three months.**
