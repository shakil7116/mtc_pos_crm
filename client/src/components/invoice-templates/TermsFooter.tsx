// Bilingual customer-facing terms footer (INV only). Cash Invoice → return policy
// only. Credit Invoice → each uncleared PDC cheque's due date, plus a standard credit
// due date for any non-PDC open balance, then the return policy. Rendered inside every
// template near the signature lines, so it appears identically on staff + printed copy.

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

export function TermsFooter({ terms }: { terms?: FooterTerms | null }) {
  if (!terms) return null; // non-INV / unsaved preview → nothing
  return (
    <div className="mt-2 pt-1.5 border-t border-gray-200 text-[7.5pt] leading-snug text-gray-600 space-y-0.5">
      {terms.isCredit && terms.chequeDue.map((c, i) => (
        <p key={`chq-${i}`} className="flex justify-between gap-3">
          <span dir="rtl">{`تاريخ استحقاق الشيك${c.number ? ` (${c.number})` : ""}: ${fmt(c.dueDate)}`}</span>
          <span>{`Cheque Due${c.number ? ` (${c.number})` : ""}: ${fmt(c.dueDate)}`}</span>
        </p>
      ))}
      {terms.isCredit && terms.standardDue && (
        <p className="flex justify-between gap-3">
          <span dir="rtl">{`تاريخ الاستحقاق: ${fmt(terms.standardDue)}`}</span>
          <span>{`Payment Due: ${fmt(terms.standardDue)}`}</span>
        </p>
      )}
      <p className="flex justify-between gap-3">
        <span dir="rtl">سياسة الإرجاع: خلال 7 أيام من تاريخ الشراء</span>
        <span>Returns accepted within 7 days of purchase date</span>
      </p>
    </div>
  );
}
