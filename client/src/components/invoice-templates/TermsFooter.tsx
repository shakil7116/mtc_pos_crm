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
  const single = terms.chequeDue.length === 1;
  return (
    <div className="mt-2 pt-1.5 border-t border-gray-200 text-[7.5pt] leading-snug text-gray-600 space-y-0.5">
      {terms.isCredit && terms.chequeDue.map((c, i) => (
        <p key={`chq-${i}`}>
          {single
            ? `Cheque Due Date: ${fmt(c.dueDate)}`
            : `Cheque${c.number ? ` ${c.number}` : ""} Due: ${fmt(c.dueDate)}`}
        </p>
      ))}
      {terms.isCredit && terms.standardDue && (
        <p>{`Payment Due Date: ${fmt(terms.standardDue)}`}</p>
      )}
      <p>Return Policy: Items may be returned within 7 days of purchase date, in original condition with proof of purchase.</p>
    </div>
  );
}
