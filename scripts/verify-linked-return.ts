import "dotenv/config";
import { db, pool } from "../server/db";
import { products, inventory } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { createTransfer, approveTransfer, receiveTransfer, getTransfers, getTransferSettlement } from "../server/storage";

const R: boolean[] = [];
const ok = (n: string, c: boolean, x = "") => { R.push(c); console.log(`   ${c ? "PASS" : "FAIL"} — ${n}${x ? " :: " + x : ""}`); };
const MARK = "__LINKRET__";
const setQ = async (pid: number, sid: number, q: number) => { const [r] = await db.select().from(inventory).where(and(eq(inventory.productId, pid), eq(inventory.storeId, sid))); if (r) await db.update(inventory).set({ qty: String(q) }).where(eq(inventory.id, r.id)); else await db.insert(inventory).values({ productId: pid, storeId: sid, qty: String(q) }); };
async function cleanup() { const ids = (await pool.query(`select id from documents where type='TR' and (notes=$1 or notes like $2)`, [MARK, `Return against%`])).rows.map((r:any)=>r.id).filter((id:number)=> true); const mine = (await pool.query(`select id from documents where type='TR' and (notes=$1 or notes like 'Return against %') and date=$2`, [MARK, "2027-06-10"])).rows.map((r:any)=>r.id); if (mine.length) { await pool.query(`delete from edit_log where document_id=any($1::int[])`,[mine]); await pool.query(`delete from stock_adjustments where reference_id=any($1::int[])`,[mine]); await pool.query(`delete from document_items where document_id=any($1::int[])`,[mine]); await pool.query(`delete from documents where id=any($1::int[])`,[mine]); } }

async function main() {
  await cleanup();
  const S1=1,S2=2,P=(await db.select().from(products).limit(1))[0].id;
  const cost=Number((await db.select().from(products).where(eq(products.id,P)))[0].costPrice||0);
  for (const s of [S1,S2]) await setQ(P,s,1000);
  const flow = async (from:number,to:number,qty:number,uid:number,linkedDocId?:number,notes?:string) => { const t = await createTransfer({date:"2027-06-10",fromStoreId:from,toStoreId:to,items:[{productId:P,description:"item",qty,unit:"PCS"}],notes:notes||MARK,linkedDocId} as any); await approveTransfer(t.id,uid); await receiveTransfer(t.id,uid); return t; };
  // original: Store1 -> Store2, 25, confirmed
  const orig = await flow(S1,S2,25,4);
  // return AFTER confirmation: Store2 -> Store1, 10, linked to orig, confirmed by other side
  const ret = await flow(S2,S1,10,5,orig.id,`Return against ${orig.number}`);

  const trs = await getTransfers();
  const o = trs.find(t=>t.id===orig.id), r = trs.find(t=>t.id===ret.id);
  ok("original stays intact (25, received)", Number(o.items[0].qty)===25 && o.status==="received");
  ok("return note links to original", r.returnOfNumber===orig.number, `returnOf=${r.returnOfNumber}`);
  ok("return confirmed by other side (uid5)", !!r.receivedByName);

  const s = await getTransferSettlement("2027-06-01","2027-06-30");
  const row=(s.settlements||[])[0];
  const net=(25-10)*cost;
  ok(`net = 15×cost (${net}); Store2 owes Store1`, row && Math.abs(row.amount-net)<0.01 && row.debtor.includes("Store 2"), `amount=${row?.amount}`);

  for (const st of [S1,S2]) await setQ(P,st,1000);
  await cleanup();
  const pass=R.filter(Boolean).length; console.log(`\n${pass}/${R.length} passed.`); await pool.end(); process.exit(pass===R.length?0:1);
}
main().catch(async(e)=>{console.error("ERR",e);try{await cleanup();await pool.end();}catch{}process.exit(1);});
