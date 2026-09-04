import React, { useRef } from "react";

export interface DocItem {
  description: string;
  sku?: string;
  qty: string | number;
  unit: string;
  price?: string | number;
  discountAmount?: string | number;
  amount?: string | number;
}

export interface DocumentTemplateProps {
  document: {
    type: "INV" | "QT" | "DN" | "CN";
    number: string;
    date: string;
    customerName?: string;
    items: DocItem[];
    subtotal?: number | string;
    discountType?: string;
    discountAmount?: number | string;
    taxRate?: number | string;
    taxAmount?: number | string;
    total?: number | string;
    totalWords?: string;
    notes?: string;
    originalInvoiceNumber?: string;
  };
  settings?: {
    storeNameEn?: string;
    storeNameAr?: string;
    addressEn?: string;
    addressAr?: string;
    phone?: string;
    crNumber?: string;
    poBox?: string;
    email?: string;
    brands?: string[];
    returnPolicyText?: string;
  };
  className?: string;
}

const DEFAULT_SETTINGS = {
  storeNameEn: "",
  storeNameAr: "",
  addressEn: "",
  addressAr: "",
  phone: "",
  crNumber: "",
  poBox: "",
  email: "",
  brands: [
    "DEWALT","STANLEY","TOTAL TOOLS","MILANO","NATIONAL",
    "BQ","BR","MÜLLER","KISTENMACHER","ORYX PAINTS","BERGER PAINTS",
  ],
  returnPolicyText:
    "Returns accepted within 7 days with original invoice — materials must be undamaged and in original condition. Management decision is final.",
};

function fmt(n: number | string | undefined): string {
  if (n === undefined || n === null) return "0.00";
  return parseFloat(String(n)).toFixed(2);
}

function fmtDate(d: string): string {
  if (!d) return "";
  const parts = d.split("-");
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return d;
}

const MIN_ROWS = 15;

export const DocumentTemplate = React.forwardRef<HTMLDivElement, DocumentTemplateProps>(
  ({ document: doc, settings: s, className }, ref) => {
    const cfg = { ...DEFAULT_SETTINGS, ...s };
    const showPrices = doc.type !== "DN";
    const isCN = doc.type === "CN";
    const isQT = doc.type === "QT";
    const isDN = doc.type === "DN";

    const titleMap = {
      INV: { en: "I N V O I C E", ar: "فاتورة", label: "BILL TO / العميل" },
      QT:  { en: "Q U O T A T I O N", ar: "عرض سعر", label: "TO / إلى" },
      DN:  { en: "D E L I V E R Y   N O T E", ar: "إشعار تسليم", label: "DELIVER TO / التسليم إلى" },
      CN:  { en: "C R E D I T   N O T E", ar: "إشعار دائن", label: "BILL TO / العميل" },
    };
    const title = titleMap[doc.type];

    const subtotal = parseFloat(String(doc.subtotal || 0));
    const discount = parseFloat(String(doc.discountAmount || 0));
    const taxAmt = parseFloat(String(doc.taxAmount || 0));
    const total = parseFloat(String(doc.total || 0));

    // Fill items to minimum rows
    const rows = [...doc.items];
    while (rows.length < MIN_ROWS) rows.push({ description: "", qty: "", unit: "" });

    return (
      <div
        ref={ref}
        className={`document-template bg-white ${className || ""}`}
        style={{
          width: "210mm",
          minHeight: "297mm",
          margin: "0 auto",
          padding: "10mm",
          fontSize: "10pt",
          fontFamily: "Arial, sans-serif",
          color: "#000",
          boxSizing: "border-box",
        }}
      >
        {/* ── HEADER ── */}
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "4px" }}>
          <tbody>
            <tr>
              {/* Left — English */}
              <td style={{ width: "38%", verticalAlign: "top", padding: "0" }}>
                <div style={{ fontWeight: "bold", fontSize: "12pt", lineHeight: "1.3" }}>
                  {cfg.storeNameEn}
                </div>
                <div style={{ fontSize: "8.5pt", lineHeight: "1.6" }}>
                  P.O. BOX: {cfg.poBox}
                </div>
                <div style={{ fontSize: "8.5pt", lineHeight: "1.4" }}>
                  PHONE: {cfg.phone}
                </div>
                <div style={{ fontSize: "8.5pt", lineHeight: "1.4" }}>
                  C.R. NO: {cfg.crNumber}
                </div>
                <div style={{ fontSize: "8.5pt", lineHeight: "1.4" }}>
                  {cfg.addressEn}
                </div>
              </td>

              {/* Center — MTC logo text */}
              <td style={{ width: "24%", textAlign: "center", verticalAlign: "middle" }}>
                <div
                  style={{
                    fontWeight: "bold",
                    fontSize: "42pt",
                    letterSpacing: "4px",
                    lineHeight: "1",
                    color: "#1e2a3a",
                  }}
                >
                  MTC
                </div>
              </td>

              {/* Right — Arabic */}
              <td style={{ width: "38%", verticalAlign: "top", textAlign: "right", direction: "rtl" }}>
                <div style={{ fontWeight: "bold", fontSize: "11pt", lineHeight: "1.3" }}>
                  مأمون م للتجارة والمقاولات ذ.م.م
                </div>
                <div style={{ fontSize: "8.5pt", lineHeight: "1.6" }}>ص.ب: ١٧٣٣٦</div>
                <div style={{ fontSize: "8.5pt", lineHeight: "1.4" }}>هاتف: ٩٧٤+ ٣٠٧٠٣٧٢٢</div>
                <div style={{ fontSize: "8.5pt", lineHeight: "1.4" }}>س.ت: ٧٢٩٨٦/١</div>
                <div style={{ fontSize: "8.5pt", lineHeight: "1.4" }}>
                  شارع النجمة، النجمة، الدوحة، قطر
                </div>
              </td>
            </tr>
          </tbody>
        </table>

        <hr style={{ border: "none", borderTop: "1.5px solid #1e2a3a", margin: "4px 0" }} />

        {/* ── TITLE BAR ── */}
        <div style={{ textAlign: "center", margin: "6px 0 4px" }}>
          <span
            style={{
              fontWeight: "bold",
              fontSize: "14pt",
              letterSpacing: "2px",
              color: isCN ? "#cc0000" : "#1e2a3a",
            }}
          >
            {title.en} / {title.ar}
          </span>
          {isCN && doc.originalInvoiceNumber && (
            <div style={{ fontSize: "8pt", marginTop: "2px", color: "#cc0000" }}>
              Against Invoice: {doc.originalInvoiceNumber}
            </div>
          )}
        </div>

        {/* ── META ROW ── */}
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            border: "1px solid #1e2a3a",
            marginBottom: "6px",
          }}
        >
          <tbody>
            <tr>
              {/* Bill To */}
              <td
                style={{
                  width: "45%",
                  padding: "4px 6px",
                  borderRight: "1px solid #1e2a3a",
                  verticalAlign: "top",
                }}
              >
                <div style={{ fontSize: "7.5pt", color: "#555", marginBottom: "2px" }}>
                  {title.label}
                </div>
                <div style={{ fontWeight: "bold", fontSize: "12pt" }}>
                  {doc.customerName || "—"}
                </div>
              </td>
              {/* Doc Number */}
              <td
                style={{
                  width: "28%",
                  padding: "4px 6px",
                  borderRight: "1px solid #1e2a3a",
                  verticalAlign: "top",
                }}
              >
                <div style={{ fontSize: "7.5pt", color: "#555", marginBottom: "2px" }}>
                  NO. / رقم
                </div>
                <div style={{ fontWeight: "bold", fontSize: "12pt" }}>{doc.number}</div>
              </td>
              {/* Date */}
              <td style={{ width: "27%", padding: "4px 6px", verticalAlign: "top" }}>
                <div style={{ fontSize: "7.5pt", color: "#555", marginBottom: "2px" }}>
                  DATE / التاريخ
                </div>
                <div style={{ fontWeight: "bold", fontSize: "12pt" }}>{fmtDate(doc.date)}</div>
              </td>
            </tr>
          </tbody>
        </table>

        {/* ── ITEMS TABLE ── */}
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            marginBottom: "6px",
            fontSize: "9pt",
          }}
        >
          <thead>
            <tr style={{ backgroundColor: "#1e2a3a", color: "#fff" }}>
              <th style={{ width: "6%", padding: "4px 3px", textAlign: "center", fontWeight: "bold" }}>NO.</th>
              <th style={{ padding: "4px 3px", textAlign: "left", fontWeight: "bold" }}>DESCRIPTION</th>
              <th style={{ width: "8%", padding: "4px 3px", textAlign: "center", fontWeight: "bold" }}>QTY</th>
              <th style={{ width: "8%", padding: "4px 3px", textAlign: "center", fontWeight: "bold" }}>UNIT</th>
              {showPrices && (
                <>
                  <th style={{ width: "12%", padding: "4px 3px", textAlign: "right", fontWeight: "bold" }}>PRICE</th>
                  <th style={{ width: "13%", padding: "4px 3px", textAlign: "right", fontWeight: "bold" }}>AMOUNT</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((item, i) => (
              <tr
                key={i}
                style={{ backgroundColor: i % 2 === 0 ? "#fff" : "#f7f8fa" }}
              >
                <td style={{ padding: "3px", textAlign: "center", borderBottom: "1px solid #eee" }}>
                  {item.description ? i + 1 : ""}
                </td>
                <td style={{ padding: "3px 4px", borderBottom: "1px solid #eee" }}>
                  <div>{item.description}</div>
                  {item.sku && (
                    <div style={{ fontSize: "7.5pt", color: "#888" }}>{item.sku}</div>
                  )}
                </td>
                <td style={{ padding: "3px", textAlign: "center", borderBottom: "1px solid #eee" }}>
                  {item.description ? item.qty : ""}
                </td>
                <td style={{ padding: "3px", textAlign: "center", borderBottom: "1px solid #eee" }}>
                  {item.description ? item.unit : ""}
                </td>
                {showPrices && (
                  <>
                    <td style={{ padding: "3px", textAlign: "right", borderBottom: "1px solid #eee" }}>
                      {item.description && item.price != null ? fmt(item.price) : ""}
                    </td>
                    <td style={{ padding: "3px", textAlign: "right", fontWeight: "bold", borderBottom: "1px solid #eee" }}>
                      {item.description && item.amount != null ? fmt(item.amount) : ""}
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>

        {/* ── BOTTOM SECTION ── */}
        {isDN ? (
          /* Delivery Note: just signature lines */
          <table style={{ width: "100%", marginTop: "20px" }}>
            <tbody>
              <tr>
                <td style={{ width: "50%", paddingRight: "20px" }}>
                  <hr style={{ border: "none", borderTop: "1px solid #000", marginBottom: "4px" }} />
                  <div style={{ fontSize: "8.5pt", fontWeight: "bold", textAlign: "center" }}>
                    DELIVERED BY / سلّمه
                  </div>
                </td>
                <td style={{ width: "50%", paddingLeft: "20px" }}>
                  <hr style={{ border: "none", borderTop: "1px solid #000", marginBottom: "4px" }} />
                  <div style={{ fontSize: "8.5pt", fontWeight: "bold", textAlign: "center" }}>
                    RECEIVED BY / استلمه
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        ) : (
          /* INV / QT / CN: amount in words + totals */
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <tbody>
              <tr style={{ verticalAlign: "top" }}>
                {/* Left: words + signatures */}
                <td style={{ width: "52%", paddingRight: "10px" }}>
                  <div style={{ fontSize: "7.5pt", color: "#555", marginBottom: "2px" }}>
                    AMOUNT IN WORDS / المبلغ بالحروف
                  </div>
                  <div style={{ fontWeight: "bold", fontStyle: "italic", fontSize: "9pt", marginBottom: "16px" }}>
                    {doc.totalWords || ""}
                  </div>

                  {/* Signatures */}
                  {doc.type === "INV" && (
                    <table style={{ width: "100%", marginTop: "8px" }}>
                      <tbody>
                        <tr>
                          <td style={{ width: "50%", paddingRight: "10px" }}>
                            <hr style={{ border: "none", borderTop: "1px solid #000", marginBottom: "3px" }} />
                            <div style={{ fontSize: "7.5pt", textAlign: "center", fontWeight: "bold" }}>
                              SALESMAN SIGNATURE
                            </div>
                            <div style={{ fontSize: "7pt", textAlign: "center", color: "#555" }}>
                              توقيع البائع
                            </div>
                          </td>
                          <td style={{ width: "50%", paddingLeft: "10px" }}>
                            <hr style={{ border: "none", borderTop: "1px solid #000", marginBottom: "3px" }} />
                            <div style={{ fontSize: "7.5pt", textAlign: "center", fontWeight: "bold" }}>
                              RECEIVER'S SIGNATURE
                            </div>
                            <div style={{ fontSize: "7pt", textAlign: "center", color: "#555" }}>
                              توقيع المستلم
                            </div>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  )}
                  {isQT && (
                    <div style={{ marginTop: "16px" }}>
                      <hr style={{ border: "none", borderTop: "1px solid #000", marginBottom: "3px", width: "70%", margin: "0 auto 3px" }} />
                      <div style={{ fontSize: "7.5pt", textAlign: "center", fontWeight: "bold" }}>
                        AUTHORIZED SIGNATURE / التوقيع المعتمد
                      </div>
                    </div>
                  )}
                  {isCN && (
                    <div style={{ marginTop: "16px" }}>
                      <hr style={{ border: "none", borderTop: "1px solid #000", marginBottom: "3px", width: "70%", margin: "0 auto 3px" }} />
                      <div style={{ fontSize: "7.5pt", textAlign: "center", fontWeight: "bold" }}>
                        AUTHORIZED BY / معتمد من
                      </div>
                    </div>
                  )}
                </td>

                {/* Right: totals box */}
                <td style={{ width: "48%" }}>
                  <table
                    style={{
                      width: "100%",
                      borderCollapse: "collapse",
                      border: "1px solid #1e2a3a",
                    }}
                  >
                    <tbody>
                      {/* NET subtotal only — discount never printed in footer. */}
                      <tr>
                        <td style={{ padding: "4px 8px", fontSize: "9pt" }}>SUBTOTAL</td>
                        <td style={{ padding: "4px 8px", textAlign: "right", fontSize: "9pt" }}>
                          {fmt(subtotal - discount)}
                        </td>
                      </tr>
                      <tr>
                        <td style={{ padding: "4px 8px", fontSize: "9pt" }}>
                          TAX ({fmt(doc.taxRate || 0)}%)
                        </td>
                        <td style={{ padding: "4px 8px", textAlign: "right", fontSize: "9pt" }}>
                          {fmt(taxAmt)}
                        </td>
                      </tr>
                      <tr>
                        <td
                          colSpan={2}
                          style={{
                            borderTop: "1.5px solid #1e2a3a",
                            padding: 0,
                          }}
                        />
                      </tr>
                      <tr style={{ backgroundColor: "#1e2a3a", color: "#fff" }}>
                        <td style={{ padding: "6px 8px", fontWeight: "bold", fontSize: "10pt" }}>
                          TOTAL / المجموع الكلي
                        </td>
                        <td style={{ padding: "6px 8px", textAlign: "right", fontWeight: "bold", fontSize: "11pt" }}>
                          QAR {fmt(total)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </td>
              </tr>
            </tbody>
          </table>
        )}

        {/* Notes */}
        {doc.notes && (
          <div style={{ marginTop: "8px", fontSize: "8pt", color: "#444" }}>
            <strong>Notes:</strong> {doc.notes}
          </div>
        )}

        {/* ── FOOTER ── */}
        <div style={{ paddingTop: "12px", borderTop: "1px solid #ddd", marginTop: "20px" }}>
          {/* Brand logos row */}
          <div style={{ textAlign: "center", fontSize: "7.5pt", color: "#555", marginBottom: "3px" }}>
            {(cfg.brands || []).join(" | ")}
          </div>

          {/* Contact line */}
          <div style={{ textAlign: "center", fontSize: "7.5pt", color: "#333", marginBottom: "2px" }}>
            {(doc.type === "INV" || doc.type === "CN") && (
              <span>EMAIL: INFO@MTC.COM  •  </span>
            )}
            MOBILE: {cfg.phone}  •  {cfg.addressEn}
          </div>
          <div style={{ textAlign: "center", fontSize: "7.5pt", color: "#333", direction: "rtl", marginBottom: "3px" }}>
            شارع النجمة، النجمة، الدوحة، قطر
          </div>

          {/* Return policy (INV only) */}
          {doc.type === "INV" && (
            <div style={{ textAlign: "center", fontSize: "7pt", color: "#777", fontStyle: "italic" }}>
              {cfg.returnPolicyText}
            </div>
          )}
        </div>

        {/* Print styles injected */}
        <style>{`
          @media print {
            body > * { visibility: hidden !important; }
            .document-template,
            .document-template * { visibility: visible !important; }
            .document-template {
              position: fixed !important;
              top: 0 !important;
              left: 0 !important;
              width: 210mm !important;
              margin: 0 !important;
              padding: 10mm !important;
            }
          }
        `}</style>
      </div>
    );
  }
);

DocumentTemplate.displayName = "DocumentTemplate";

export function printDocument(): void {
  window.print();
}

export async function generatePDF(
  docData: DocumentTemplateProps["document"],
  settingsData?: DocumentTemplateProps["settings"],
  filename?: string,
): Promise<void> {
  try {
    const res = await fetch("/api/generate-pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invoice: { ...docData, items: docData.items } }),
    });
    if (!res.ok) throw new Error("PDF generation failed");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = window.document.createElement("a");
    a.href = url;
    a.download = filename || `${docData.number}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (e) {
    console.error("PDF error:", e);
    window.print();
  }
}

export default DocumentTemplate;
