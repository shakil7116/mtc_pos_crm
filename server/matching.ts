// ─────────────────────────────────────────────────────────────────────────────
// Product name matching — the engine behind OCR import, CSV import and the
// assistant's "find me this item" lookups.
//
// The problem it solves: the same physical item arrives under many names.
// "PVC TROWEL" and "PVC GOLMALA" are one product. "TRACK CHANNEL" and
// "RUNNER CHANNEL" are one product. Re-typing them by hand on every supplier
// invoice is what creates duplicate SKUs — and duplicates split stock, break
// "which item sold more", and skew profit-per-product.
//
// Three rules keep it from doing damage:
//
//   1. TRUE ALIAS ONLY.  An alias means "same physical item, other name".
//      SHOWER MIXER is a *kind of* faucet, not the same thing — a faucet is
//      not a shower mixer. That relationship belongs in products.category,
//      never in product_aliases. Merging a hypernym hands the customer the
//      wrong goods and books the stock movement against the wrong SKU.
//
//   2. SPEC IS A HARD BLOCKER.  "GYPSUM SCREW 25MM" and "GYPSUM SCREW 40MM"
//      are 95% the same string and different products at different costs.
//      When both sides carry a size/spec and the sizes disagree the match is
//      rejected outright, whatever the text score says.
//
//   3. NOTHING AUTO-MERGES ON A GUESS.  Only an exact hit, a confirmed alias,
//      or a very high score links automatically. Everything else goes to a
//      human review queue, and their confirmation is written back as an alias
//      so the same question is never asked twice.
//
// This file is pure logic — no DB, no network — so it can be run against the
// real catalogue by scripts/verify-matching.mjs.
// ─────────────────────────────────────────────────────────────────────────────

/** Score at or above which a match is applied without asking anyone. */
export const AUTO_MATCH_SCORE = 0.8;
/** Score at or above which a match is offered for human review. Below → "new product?". */
export const REVIEW_MATCH_SCORE = 0.55;

// Units that make a token a *specification* rather than a describing word.
// Longest-first so MM beats M and ML beats L.
const SPEC_UNITS = ["MM", "CM", "MTR", "KG", "GM", "ML", "IN", "FT", "M", "G", "L", "W", "V", "A"];
const SPEC_UNIT_RE = new RegExp(`(\\d+(?:\\.\\d+)?)\\s*(${SPEC_UNITS.join("|")})(?![A-Z0-9])`, "g");
const DIMENSION_RE = /(\d+(?:\.\d+)?)\s*[X*]\s*(\d+(?:\.\d+)?)/g;

// Words that carry no identifying information — they inflate similarity between
// unrelated items ("PVC PIPE FITTING" vs "GI PIPE FITTING") without adding meaning.
const STOP_WORDS = new Set([
  "PCS", "PC", "NOS", "NO", "EACH", "SET", "PKT", "PACKET", "BOX", "ROLL", "BAG",
  "OF", "FOR", "AND", "THE", "WITH", "TYPE", "SIZE", "ITEM", "NEW", "QTY",
]);

const FRACTION_RE = /\b(\d+)\s*\/\s*(\d+)\b/g;

/**
 * Canonical form of a product name for comparison and for the alias unique key.
 * Uppercases, folds inch marks and unit spellings, turns fractions into decimals
 * (so 1/2" and 0.5 IN collide), then strips punctuation.
 */
export function normalizeName(input: string): string {
  let s = String(input || "").toUpperCase();

  // Smart quotes / primes → the plain inch mark.
  s = s.replace(/[‘’“”′″]/g, '"');

  // 1/2 → 0.5, so 1/2" and 0.5 IN land on the same token.
  s = s.replace(FRACTION_RE, (m, a, b) => {
    const n = Number(a) / Number(b);
    return Number.isFinite(n) && n !== 0 ? String(Math.round(n * 1000) / 1000) : m;
  });

  // Unit spellings → one canonical form each.
  s = s.replace(/"/g, " IN ");
  s = s.replace(/\bINCHES\b|\bINCH\b/g, " IN ");
  s = s.replace(/\bFEET\b|\bFOOT\b/g, " FT ");
  s = s.replace(/\bMILLIMET(?:ER|RE)S?\b/g, " MM ");
  s = s.replace(/\bCENTIMET(?:ER|RE)S?\b/g, " CM ");
  s = s.replace(/\bMET(?:ER|RE)S?\b|\bMTR\b/g, " M ");
  s = s.replace(/\bKILOS?\b|\bKGS\b/g, " KG ");
  s = s.replace(/\bGRAMS?\b|\bGMS\b/g, " G ");

  // Everything that is not a letter, digit or decimal point becomes a gap.
  s = s.replace(/[^A-Z0-9.]+/g, " ");
  // A dot that is not between digits is punctuation, not a decimal point.
  s = s.replace(/(?<!\d)\.|\.(?!\d)/g, " ");
  s = s.replace(/\s+/g, " ").trim();

  // Glue a number to the unit that follows it: "25 MM" and "25MM" are one token,
  // otherwise the same screw written two ways scores as two different products.
  s = s.replace(new RegExp(`(\\d)\\s+(${SPEC_UNITS.join("|")})(?![A-Z0-9])`, "g"), "$1$2");

  return s;
}

/** A token that is purely a measurement, e.g. "25MM", "0.5IN", "12X12". */
const SPEC_TOKEN_RE = new RegExp(`^(?:\\d+(?:\\.\\d+)?(?:${SPEC_UNITS.join("|")})|\\d+(?:\\.\\d+)?X\\d+(?:\\.\\d+)?)$`);

/**
 * Normalized name with stop-words and measurement tokens dropped — what the text
 * score actually compares.
 *
 * Sizes are deliberately removed here because specsConflict() already governs
 * them, and it governs them absolutely. Leaving them in would double-count: the
 * text score would rate "GYPSUM SCREW 25MM" and "GYPSUM SCREW 40MM" as near
 * twins (they are, textually) while also rating "PVC GOLMALA 6 INCH" as a poor
 * match for "PVC GOLMALA" (it is not — that is the same item with its size
 * written down). Splitting the two jobs gets both cases right.
 */
export function significantForm(input: string): string {
  const kept = normalizeName(input)
    .split(" ")
    .filter((t) => t && !STOP_WORDS.has(t) && !SPEC_TOKEN_RE.test(t));
  // A product genuinely named only by its size keeps that size rather than vanishing.
  return kept.length ? kept.join(" ") : normalizeName(input);
}

/**
 * The size/spec tokens in a name: "GYPSUM SCREW 25MM" → {"25MM"}, "TILE 12X12" → {"12X12"}.
 * Bare numbers are deliberately excluded — "PIPE 4" with no unit is too ambiguous
 * to block a match on.
 */
export function extractSpecs(input: string): Set<string> {
  const s = normalizeName(input);
  const specs = new Set<string>();

  // exec loops rather than matchAll: this project compiles to ES5 and cannot
  // iterate an iterator directly.
  DIMENSION_RE.lastIndex = 0;
  for (let m = DIMENSION_RE.exec(s); m; m = DIMENSION_RE.exec(s)) {
    const pair = [Number(m[1]), Number(m[2])].sort((x, y) => x - y);
    specs.add(`${pair[0]}X${pair[1]}`);
  }
  SPEC_UNIT_RE.lastIndex = 0;
  for (let m = SPEC_UNIT_RE.exec(s); m; m = SPEC_UNIT_RE.exec(s)) {
    specs.add(`${Number(m[1])}${m[2]}`);
  }
  return specs;
}

/**
 * True when both names carry a spec and the specs disagree — the hard blocker.
 * One side missing its spec is NOT a conflict: OCR frequently drops the size,
 * and that case belongs in human review, not in an automatic rejection.
 */
export function specsConflict(a: string, b: string): boolean {
  const sa = extractSpecs(a);
  const sb = extractSpecs(b);
  if (!sa.size || !sb.size) return false;
  return !Array.from(sa).some((spec) => sb.has(spec));
}

/**
 * True when the catalogue records a size for this product and the incoming line
 * never said which one — "PVC PIPE" against a catalogue holding 1/2" PVC PIPE.
 *
 * Because sizes are stripped before scoring, those two read as a perfect textual
 * match, and with only one sized variant on the shelf nothing else would stop it
 * from auto-linking. The shop distinguishes those sizes even when the supplier's
 * paperwork does not, so this is a question for a person, not a default.
 *
 * The reverse direction is fine and stays unpenalised: a line that carries a size
 * against a catalogue entry that does not simply means the catalogue never broke
 * that item out by size.
 */
export function specUnderspecified(query: string, candidate: string): boolean {
  return extractSpecs(candidate).size > 0 && extractSpecs(query).size === 0;
}

/** Ceiling applied to an underspecified match — high enough to be offered, never applied. */
const UNDERSPECIFIED_CAP = AUTO_MATCH_SCORE - 0.01;

/** pg_trgm-compatible trigram set: each word padded with two leading spaces and one trailing. */
function trigrams(s: string): Set<string> {
  const out = new Set<string>();
  for (const word of s.split(" ")) {
    if (!word) continue;
    const padded = `  ${word} `;
    for (let i = 0; i + 3 <= padded.length; i++) out.add(padded.slice(i, i + 3));
  }
  return out;
}

/** Jaccard overlap of trigram sets — the same measure Postgres pg_trgm similarity() returns. */
export function trigramSimilarity(a: string, b: string): number {
  const ta = trigrams(a);
  const tb = trigrams(b);
  if (!ta.size || !tb.size) return 0;
  let shared = 0;
  ta.forEach((g) => { if (tb.has(g)) shared++; });
  return shared / (ta.size + tb.size - shared);
}

/**
 * Share of `from`'s words that are present in `to`, where a word "matches" if
 * some word over there is close enough to be the same word misspelled.
 * SILICONE/SILICON counts; SILICON/CEMENT does not.
 */
function tokenCoverage(from: string[], to: string[]): number {
  if (!from.length || !to.length) return 0;
  let sum = 0;
  for (const t of from) {
    let best = 0;
    for (const u of to) {
      if (t === u) { best = 1; break; }
      const s = trigramSimilarity(t, u);
      if (s > best) best = s;
    }
    // Under half-similar is a different word, not a typo of this one.
    sum += best >= 0.5 ? best : 0;
  }
  return sum / from.length;
}

/**
 * Word overlap measured in BOTH directions and combined as a harmonic mean.
 *
 * Measuring one way only is the trap: every word of "PVC PIPE" appears in
 * "PVC PIPE CLIP", so a one-directional score calls that a perfect match and
 * auto-merges a pipe into a pipe clip. Requiring the candidate to be covered by
 * the query too drags that back down, while leaving genuine same-item pairs high.
 */
function tokenF1(a: string, b: string): number {
  const ta = a.split(" ").filter(Boolean);
  const tb = b.split(" ").filter(Boolean);
  const p = tokenCoverage(ta, tb);
  const r = tokenCoverage(tb, ta);
  return p + r === 0 ? 0 : (2 * p * r) / (p + r);
}

/**
 * Text similarity of two product names, 0–1. Blends character-level trigrams
 * (survives typos and OCR noise) with word-level overlap (stops "PVC PIPE" from
 * scoring high against "PVC PIPE CLIP" purely on shared characters). Weighted
 * toward words, because in this catalogue the distinguishing information is
 * which words appear, not how long the string is.
 */
export function nameSimilarity(a: string, b: string): number {
  const sa = significantForm(a);
  const sb = significantForm(b);
  if (!sa || !sb) return 0;
  if (sa === sb) return 1;
  return 0.45 * trigramSimilarity(sa, sb) + 0.55 * tokenF1(sa, sb);
}

export type MatchReason = "sku" | "alias" | "exact-name" | "fuzzy";
export type MatchDecision = "auto" | "review" | "none";

export interface MatchCandidateInput {
  productId: number;
  name: string;
  sku?: string | null;
  /** Confirmed alternate names for this product, from product_aliases. */
  aliases?: string[];
}

export interface MatchCandidate {
  productId: number;
  name: string;
  sku: string | null;
  score: number;
  reason: MatchReason;
  /** Which string produced the hit — the alias, when reason is "alias". */
  matchedOn: string;
}

export interface MatchResult {
  query: string;
  normalized: string;
  specs: string[];
  decision: MatchDecision;
  /** Set only when decision is "auto". */
  productId: number | null;
  candidates: MatchCandidate[];
}

/**
 * Rank a catalogue against one incoming description.
 *
 * The ladder runs cheapest-first: SKU, then confirmed alias, then exact name,
 * then fuzzy. A hit on any of the first three is decisive, which is what makes
 * a confirmed alias permanent — once someone rules that PVC GOLMALA is PVC
 * TROWEL, that lookup is exact forever and never re-enters the review queue.
 */
export function matchProduct(
  query: string,
  catalogue: MatchCandidateInput[],
  opts: { sku?: string | null; limit?: number } = {},
): MatchResult {
  const limit = opts.limit ?? 5;
  const normalized = normalizeName(query);
  const specs = Array.from(extractSpecs(query));
  const base = { query, normalized, specs };

  if (!normalized) {
    return { ...base, decision: "none" as const, productId: null, candidates: [] };
  }

  // 1 ─ SKU is an identifier, not a description: an exact hit wins outright and
  //     skips the spec guard (the SKU *is* the spec).
  const wantedSku = opts.sku ? String(opts.sku).trim().toUpperCase() : "";
  if (wantedSku) {
    const hit = catalogue.find((c) => (c.sku || "").trim().toUpperCase() === wantedSku);
    if (hit) {
      return {
        ...base,
        decision: "auto" as const,
        productId: hit.productId,
        candidates: [{ productId: hit.productId, name: hit.name, sku: hit.sku ?? null, score: 1, reason: "sku" as const, matchedOn: wantedSku }],
      };
    }
  }

  const scored: MatchCandidate[] = [];

  for (const c of catalogue) {
    // 2 ─ Confirmed alias. A human already ruled on this exact string.
    let aliasHit = "";
    for (const alias of c.aliases || []) {
      if (normalizeName(alias) === normalized) { aliasHit = alias; break; }
    }
    if (aliasHit) {
      scored.push({ productId: c.productId, name: c.name, sku: c.sku ?? null, score: 1, reason: "alias", matchedOn: aliasHit });
      continue;
    }

    // 3 ─ Exact name after normalization (1/2" PIPE === 0.5 IN PIPE).
    if (normalizeName(c.name) === normalized) {
      scored.push({ productId: c.productId, name: c.name, sku: c.sku ?? null, score: 1, reason: "exact-name", matchedOn: c.name });
      continue;
    }

    // 4 ─ Fuzzy, and only here does the spec guard apply. Rule 2: disagreeing
    //     sizes kill the match no matter how close the words are.
    if (specsConflict(query, c.name)) continue;

    let best = nameSimilarity(query, c.name);
    let on = c.name;
    if (specUnderspecified(query, c.name)) best = Math.min(best, UNDERSPECIFIED_CAP);

    for (const alias of c.aliases || []) {
      if (specsConflict(query, alias)) continue;
      let s = nameSimilarity(query, alias);
      if (specUnderspecified(query, alias)) s = Math.min(s, UNDERSPECIFIED_CAP);
      if (s > best) { best = s; on = alias; }
    }
    if (best >= 0.3) {
      scored.push({ productId: c.productId, name: c.name, sku: c.sku ?? null, score: Math.round(best * 1000) / 1000, reason: "fuzzy", matchedOn: on });
    }
  }

  scored.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  const candidates = scored.slice(0, limit);
  const top = candidates[0];
  const runnerUp = candidates[1];

  if (!top || top.score < REVIEW_MATCH_SCORE) {
    return { ...base, decision: "none" as const, productId: null, candidates };
  }

  // A fuzzy top score only auto-applies when it is both high AND clearly ahead of
  // the runner-up. Two near-identical candidates mean a real ambiguity in the
  // catalogue — settling it on a 0.01 margin is exactly how the wrong SKU gets
  // picked, so that goes to a human instead.
  const decisive =
    top.reason !== "fuzzy" ||
    (top.score >= AUTO_MATCH_SCORE && (!runnerUp || top.score - runnerUp.score >= 0.08));

  return decisive
    ? { ...base, decision: "auto" as const, productId: top.productId, candidates }
    : { ...base, decision: "review" as const, productId: null, candidates };
}
