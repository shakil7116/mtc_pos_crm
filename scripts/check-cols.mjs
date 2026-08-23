import 'dotenv/config';
import pg from 'pg';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const c = await pool.connect();

// Run migration first (idempotent)
await c.query("ALTER TABLE arrangement_notes ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ");
await c.query("ALTER TABLE arrangement_notes ADD COLUMN IF NOT EXISTS completed_by_id INTEGER REFERENCES users(id)");
await c.query("ALTER TABLE arrangement_notes ADD COLUMN IF NOT EXISTS has_issues BOOLEAN DEFAULT false");
await c.query("ALTER TABLE arrangement_note_items ADD COLUMN IF NOT EXISTS picked_qty NUMERIC");
await c.query("ALTER TABLE arrangement_note_items ADD COLUMN IF NOT EXISTS issue_type TEXT");
await c.query("ALTER TABLE arrangement_note_items ADD COLUMN IF NOT EXISTS issue_note TEXT");
await c.query("ALTER TABLE arrangement_note_items ADD COLUMN IF NOT EXISTS picked_at TIMESTAMPTZ");

// Verify
const r1 = await c.query("SELECT column_name FROM information_schema.columns WHERE table_name='arrangement_notes' ORDER BY ordinal_position");
console.log('arrangement_notes:', r1.rows.map(r => r.column_name).join(', '));
const r2 = await c.query("SELECT column_name FROM information_schema.columns WHERE table_name='arrangement_note_items' ORDER BY ordinal_position");
console.log('arrangement_note_items:', r2.rows.map(r => r.column_name).join(', '));

c.release();
await pool.end();
