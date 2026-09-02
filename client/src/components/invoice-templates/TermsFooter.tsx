// Bilingual customer-facing terms footer (INV only). Cash Invoice → return policy
// only. Credit Invoice → each uncleared PDC cheque's due date, plus a standard credit
// due date for any non-PDC open balance, then the return policy. Rendered inside every
// template near the signature lines, so it appears identically on staff + printed copy.
//
// Bilingual on purpose: this block carries the only obligations printed on the
// document — when the money is due and what can be sent back. An Arabic-speaking
// customer should not have to take the English on trust.

export interface FooterTerms {
  isCredit: boolean;
  chequeDue: { number: string; dueDate: string }[];
  standardDue: string | null;
}

const fmt = (iso: string): string => {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return d && m && y ? `${d}/${m}/${y}` : iso;
};

/** One line, English then Arabic, so neither reads as the footnote of the other. */
function Line({ en, ar }: { en: string; ar: string }) {
  return (
    <p className="flex justify-between gap-3 items-baseline">
      <span>{en}</span>
      <span className="font-arabic text-right" dir="rtl" style={{ fontSize: "1.1em" }}>{ar}</span>
    </p>
  );
}

export function TermsFooter({ terms }: { terms?: FooterTerms | null }) {
  if (!terms) return null; // non-INV / unsaved preview → nothing
  const single = terms.chequeDue.length === 1;
  return (
    <div className="mt-2 pt-1.5 border-t border-gray-200 text-[7.5pt] leading-snug text-gray-600 space-y-0.5">
      {terms.isCredit && terms.chequeDue.map((c, i) => (
        <Line
          key={`chq-${i}`}
          en={single
            ? `Cheque Due Date: ${fmt(c.dueDate)}`
            : `Cheque${c.number ? ` ${c.number}` : ""} Due: ${fmt(c.dueDate)}`}
          ar={single
            ? `تاريخ استحقاق الشيك: ${fmt(c.dueDate)}`
            : `استحقاق الشيك${c.number ? ` ${c.number}` : ""}: ${fmt(c.dueDate)}`}
        />
      ))}
      {terms.isCredit && terms.standardDue && (
        <Line
          en={`Payment Due Date: ${fmt(terms.standardDue)}`}
          ar={`تاريخ استحقاق السداد: ${fmt(terms.standardDue)}`}
        />
      )}
      <Line
        en="Return Policy: items may be returned within 7 days of purchase, in original condition with proof of purchase."
        ar="سياسة الإرجاع: تُقبل الإرجاعات خلال 7 أيام من الشراء، بحالتها الأصلية ومع إثبات الشراء."
      />
    </div>
  );
}
