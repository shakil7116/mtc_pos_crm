// The complete unit list a building-materials store needs, in one place.
//
// WHY IT MATTERS: adding a product and not finding its unit is a dead end
// mid-job — the person either invents a second spelling of one that already
// exists (PIECE beside PCS) or picks the wrong one. Both corrupt stock, and now
// also the pack-size conversion in shared/unit.ts, which keys off the unit word.
//
// So a new business is given the whole list on its first day, before anyone can
// invent anything. Rules: SHORT CODES, uppercase, one spelling per unit, under
// seven characters so they always fit the unit column on a printed invoice.
//
// This is the ONE source: server/setup.ts gives it to a brand-new database and
// scripts/seed-units.mjs fills an existing one.

export type UnitEntry = { code: string; meaning: string };

export const UNIT_CATALOGUE: UnitEntry[] = [
  { code: "PCS",     meaning: "Pieces" },
  { code: "SET",     meaning: "Set" },
  { code: "PAIR",    meaning: "Pair" },
  { code: "DOZ",     meaning: "Dozen" },
  { code: "BAG",     meaning: "Bag — cement, plaster, grout" },
  { code: "BOX",     meaning: "Box" },
  { code: "CTN",     meaning: "Carton" },
  { code: "PKT",     meaning: "Packet" },
  { code: "BUNDLE",  meaning: "Bundle — steel bars, ply, timber" },
  { code: "ROLL",    meaning: "Roll — membrane, mesh, tape" },
  { code: "COIL",    meaning: "Coil — wire, cable" },
  { code: "DRUM",    meaning: "Drum" },
  { code: "PAIL",    meaning: "Pail — paint, adhesive" },
  { code: "TIN",     meaning: "Tin" },
  { code: "TUBE",    meaning: "Tube — silicone, sealant" },
  { code: "CAN",     meaning: "Can — spray, solvent" },
  { code: "CRATE",   meaning: "Crate — tiles, glass" },
  { code: "PALLET",  meaning: "Pallet" },
  { code: "SHEET",   meaning: "Sheet — ply, gypsum, MDF" },
  { code: "MTR",     meaning: "Metre — pipe, cable, profile sold loose" },
  { code: "CM",      meaning: "Centimetre — a cut length" },
  { code: "RMT",     meaning: "Running metre — skirting, profile, pipe" },
  { code: "LENGTH",  meaning: "Length — a full bar or pipe as supplied" },
  { code: "FT",      meaning: "Foot" },
  { code: "RFT",     meaning: "Running foot" },
  { code: "SQM",     meaning: "Square metre — tile, marble, cladding" },
  { code: "SQFT",    meaning: "Square foot" },
  { code: "CUM",     meaning: "Cubic metre — sand, aggregate, ready-mix" },
  { code: "CFT",     meaning: "Cubic foot" },
  { code: "LTR",     meaning: "Litre" },
  { code: "GAL",     meaning: "Gallon" },
  { code: "KG",      meaning: "Kilogram" },
  { code: "TON",     meaning: "Tonne — steel, aggregate" },
  { code: "TRIP",    meaning: "Trip — a truck load of sand or aggregate" },
  { code: "LOT",     meaning: "Lot — a job lot, sold as one" },
  { code: "LS",      meaning: "Lump sum — labour or a whole job" },
  { code: "HR",      meaning: "Hour — labour, equipment" },
  { code: "DAY",     meaning: "Day — equipment hire" },
];

/** Just the codes, in order — what goes into the product_units list. */
export const UNIT_CODES: string[] = UNIT_CATALOGUE.map((u) => u.code);
