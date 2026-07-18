// Shared form-validation helpers (Phase 10 — Agent 1, Fix 5).
// One source of truth so customer / supplier / product / invoice forms all
// reject the same nonsense: numbers as names, bad phones, negative prices, etc.
// Each validator returns an error string, or null when the value is acceptable.

/** Name: real text, min 2 chars, cannot be only digits/punctuation. */
export function validateName(v: string): string | null {
  const s = (v ?? "").trim();
  if (!s) return "Name is required";
  if (s.length < 2) return "Name must be at least 2 characters";
  if (!/[A-Za-z؀-ۿ]/.test(s)) return "Name must contain letters, not just numbers";
  if (/^\d+$/.test(s)) return "Name cannot be a number";
  return null;
}

/** Phone: optional; if present must be digits (±, spaces, dashes ok) with ≥8 digits. */
export function validatePhone(v: string, required = false): string | null {
  const s = (v ?? "").trim();
  if (!s) return required ? "Phone is required" : null;
  if (!/^[+\d][\d\s-]*$/.test(s)) return "Phone can only contain numbers";
  const digits = s.replace(/\D/g, "");
  if (digits.length < 8) return "Phone must have at least 8 digits";
  return null;
}

/** Email: optional; if present must look like an email. */
export function validateEmail(v: string): string | null {
  const s = (v ?? "").trim();
  if (!s) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return "Enter a valid email address";
  return null;
}

/** Money that must be ≥ 0 (credit limit, opening balances). Blank = 0, allowed. */
export function validateNonNegative(v: string | number, label = "Value"): string | null {
  if (v === "" || v == null) return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return `${label} must be a number`;
  if (n < 0) return `${label} cannot be negative`;
  return null;
}

/** Price that must be strictly > 0. */
export function validatePositivePrice(v: string | number, label = "Price"): string | null {
  const n = Number(v);
  if (v === "" || v == null || !Number.isFinite(n)) return `${label} is required`;
  if (n <= 0) return `${label} must be greater than zero`;
  return null;
}

/** Whole positive quantity (> 0, integer). */
export function validateQty(v: string | number): string | null {
  const n = Number(v);
  if (!Number.isFinite(n)) return "Quantity must be a number";
  if (n <= 0) return "Quantity must be greater than zero";
  if (!Number.isInteger(n)) return "Quantity must be a whole number";
  return null;
}

/** SKU: alphanumeric (dash/underscore allowed), no spaces. Optional blank. */
export function validateSku(v: string, required = false): string | null {
  const s = (v ?? "").trim();
  if (!s) return required ? "SKU is required" : null;
  if (/\s/.test(s)) return "SKU cannot contain spaces";
  if (!/^[A-Za-z0-9_-]+$/.test(s)) return "SKU must be alphanumeric (no symbols)";
  return null;
}

/** Format a phone as the user types: keep a leading +, group the rest. */
export function formatPhone(v: string): string {
  const raw = (v ?? "").replace(/[^\d+]/g, "");
  const plus = raw.startsWith("+") ? "+" : "";
  const digits = raw.replace(/\D/g, "");
  const groups = digits.match(/.{1,4}/g) ?? [];
  return (plus + groups.join(" ")).trim();
}
