# CSV Generator Prompt

Copy-paste the prompt below into any AI (ChatGPT, Claude, etc.) to generate sample CSV data for importing into the MTC POS CRM system. Replace the number of rows and entity type as needed.

---

## Prompt

```
Generate a CSV file for importing [CUSTOMERS / PRODUCTS / SUPPLIERS] into a building materials POS system based in UAE. Generate [NUMBER] realistic sample rows.

Use these exact columns depending on the entity:

CUSTOMERS:
name, phone, type, credit_limit, trn, address, notes, payment_terms
- type must be one of: walk-in, contractor, corporate, government
- phone format: +971XXXXXXXXX
- trn: 15-digit UAE TRN (leave blank for walk-in)
- credit_limit: number (0 for walk-in)
- payment_terms: e.g. Net 30, Net 60, COD, or blank

PRODUCTS:
sku, name, category, unit, sale_price, wholesale_price, cost_price, min_stock_qty, supplier_name, location_area, location_rack, location_shelf
- category examples: Cement, Steel, Wood, Paint, Plumbing, Tiles, Electrical, Aggregates, Hardware, Safety, Waterproofing
- unit must be one of: PCS, BAG, BOX, ROLL, SHEET, TON, KG, LTR, MTR, SET, PAIR, BUNDLE
- sale_price > wholesale_price > cost_price
- sku format: 3-letter category code + dash + 3-digit number (e.g. CEM-001)

SUPPLIERS:
name, company, whatsapp, phone, email, address, notes, payment_terms, credit_days, payment_mode
- phone/whatsapp format: +971XXXXXXXXX
- credit_days: 0 for cash, 30/45/60/90 for credit
- payment_mode: cash or credit
- address: UAE city + area

Output only the raw CSV with headers as the first row. No explanation, no markdown formatting, no code block — just plain CSV text ready to save as a .csv file.
```
