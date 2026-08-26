// Proves the matcher behaves on the cases that actually matter in this trade:
// trade-slang synonyms, sizes that must never merge, and category words that
// look like synonyms but are not. Pure logic — no DB, no API key needed.
//   Run: npx tsx scripts/verify-matching.ts
import { matchProduct, normalizeName, specsConflict, type MatchCandidateInput } from "../server/matching";

// A small stand-in catalogue in the shop's own vocabulary.
const CATALOGUE: MatchCandidateInput[] = [
  { productId: 1, name: "PVC TROWEL", sku: "TRW-PVC", aliases: ["PVC GOLMALA", "GOLMALA TROWEL"] },
  { productId: 2, name: "TRACK CHANNEL", sku: "CH-TRK", aliases: ["RUNNER CHANNEL"] },
  { productId: 3, name: "SHOWER MIXER", sku: "MIX-SHW", aliases: [] },
  { productId: 4, name: "KITCHEN SINK FAUCET", sku: "FCT-KIT", aliases: [] },
  { productId: 5, name: "GYPSUM SCREW 25MM", sku: "SCR-25", aliases: [] },
  { productId: 6, name: "GYPSUM SCREW 40MM", sku: "SCR-40", aliases: [] },
  { productId: 7, name: '1/2" PVC PIPE', sku: "PIP-PVC-05", aliases: [] },
  { productId: 8, name: "SILICON GUN", sku: "GUN-SIL", aliases: [] },
];

interface Case {
  what: string;
  query: string;
  sku?: string;
  expect: "auto" | "review" | "none";
  expectProduct?: number;
  why: string;
}

const CASES: Case[] = [
  {
    what: "Confirmed alias resolves exactly",
    query: "PVC GOLMALA", expect: "auto", expectProduct: 1,
    why: "someone already ruled this is the PVC TROWEL — never ask again",
  },
  {
    what: "Alias survives OCR noise around it",
    query: "PVC GOLMALA 6 INCH", expect: "auto", expectProduct: 1,
    why: "extra size words must not lose a known alias",
  },
  {
    what: "Second trade synonym resolves",
    query: "RUNNER CHANNEL", expect: "auto", expectProduct: 2,
    why: "same physical channel, other name on the supplier's invoice",
  },
  {
    what: "HYPERNYM IS NOT A SYNONYM",
    query: "FAUCET", expect: "none",
    why: "a shower mixer is a KIND of faucet — merging them ships the wrong goods",
  },
  {
    what: "SPEC GUARD: wrong size never auto-links",
    query: "GYPSUM SCREW 32MM", expect: "none",
    why: "95% the same string as both screws, and it is neither of them",
  },
  {
    what: "SPEC GUARD: right size links cleanly",
    query: "GYPSUM SCREW 25 MM", expect: "auto", expectProduct: 5,
    why: "spacing differs, the spec agrees — this is the same screw",
  },
  {
    what: "Fraction and inch mark normalize together",
    query: "0.5 IN PVC PIPE", expect: "auto", expectProduct: 7,
    why: '1/2" and 0.5 IN are the same pipe written two ways',
  },
  {
    what: "Typo still finds the item",
    query: "SILICONE GUN", expect: "auto", expectProduct: 8,
    why: "OCR and hand-typing drop or add letters constantly",
  },
  {
    what: "SKU wins outright",
    query: "SOME GARBLED OCR TEXT", sku: "GUN-SIL", expect: "auto", expectProduct: 8,
    why: "a SKU is an identifier, not a description",
  },
  {
    what: "Genuinely unknown item is not forced into a match",
    query: "CEMENT BAG 50KG", expect: "none",
    why: "inventing a match here is how phantom stock movements start",
  },
  {
    what: "A bare slang word is offered, never assumed",
    query: "GOLMALA", expect: "review", expectProduct: undefined,
    why: "one word is thin evidence — a human confirms once, then it is an alias forever",
  },
  {
    what: "A part is not its assembly",
    query: "PVC PIPE", expect: "review", expectProduct: undefined,
    why: "every word of it appears in other pipe products; auto-merging would pick one at random",
  },
];

let pass = 0;
const failures: string[] = [];

console.log("\nProduct matcher — behaviour check\n" + "─".repeat(74));

for (const c of CASES) {
  const r = matchProduct(c.query, CATALOGUE, { sku: c.sku });
  const okDecision = r.decision === c.expect;
  const okProduct = c.expectProduct === undefined || r.productId === c.expectProduct;
  const ok = okDecision && okProduct;

  const top = r.candidates[0];
  const detail = top ? `${top.name} (${top.reason} ${top.score})` : "no candidate";
  console.log(`${ok ? "PASS" : "FAIL"}  ${c.what}`);
  console.log(`      "${c.query}" → ${r.decision}${r.productId ? ` #${r.productId}` : ""} · ${detail}`);
  console.log(`      ${c.why}`);

  if (ok) pass++;
  else failures.push(`${c.what}: expected ${c.expect}${c.expectProduct ? ` #${c.expectProduct}` : ""}, got ${r.decision}${r.productId ? ` #${r.productId}` : ""}`);
}

console.log("─".repeat(74));

// The normalization layer these cases rest on.
const NORM = [
  ['1/2" PVC PIPE', "0.5IN PVC PIPE"],
  ["3/4 INCH ELBOW", "0.75IN ELBOW"],
  ["GYPSUM SCREW 25 MM", "GYPSUM SCREW 25MM"],
  ["  pvc   trowel  ", "PVC TROWEL"],
  ["SCREW-25MM (BOX)", "SCREW 25MM BOX"],
];
for (const [input, expected] of NORM) {
  const got = normalizeName(input);
  const ok = got === expected;
  if (ok) pass++; else failures.push(`normalizeName("${input}") → "${got}", expected "${expected}"`);
  console.log(`${ok ? "PASS" : "FAIL"}  normalize "${input}" → "${got}"`);
}

// The blocker itself, stated directly.
const CONFLICTS: [string, string, boolean][] = [
  ["GYPSUM SCREW 25MM", "GYPSUM SCREW 40MM", true],
  ["GYPSUM SCREW 25MM", "GYPSUM SCREW 25 MM", false],
  ["GYPSUM SCREW", "GYPSUM SCREW 40MM", false], // one side silent → review, not rejection
  ['1/2" PIPE', "0.5 IN PIPE", false],
];
for (const [a, b, expected] of CONFLICTS) {
  const got = specsConflict(a, b);
  const ok = got === expected;
  if (ok) pass++; else failures.push(`specsConflict("${a}","${b}") → ${got}, expected ${expected}`);
  console.log(`${ok ? "PASS" : "FAIL"}  spec conflict "${a}" vs "${b}" → ${got}`);
}

const total = CASES.length + NORM.length + CONFLICTS.length;
console.log("─".repeat(74));
console.log(`${pass}/${total} passed`);
if (failures.length) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  · ${f}`);
  process.exit(1);
}
