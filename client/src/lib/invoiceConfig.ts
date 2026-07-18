import { useEffect, useState } from "react";
import type { TemplateId } from "@/components/invoice-templates";

/**
 * Admin-controlled invoice configuration.
 * Persisted in localStorage; changes broadcast so editor + templates react live.
 */
export interface InvoiceConfig {
  defaultTemplate: TemplateId;
  showPoNumber: boolean;
  showSignature: boolean;
  showReturnPolicy: boolean;
  showAmountInWords: boolean;
  defaultTaxRate: number;
  returnPolicyText: string;
}

export const DEFAULT_CONFIG: InvoiceConfig = {
  defaultTemplate: "paper-blue",
  showPoNumber: true,
  showSignature: true,
  showReturnPolicy: true,
  showAmountInWords: true,
  defaultTaxRate: 0,
  returnPolicyText: "Goods sold are not returnable after 7 days. Original invoice required.",
};

const KEY = "mtc_invoice_config";
const EVENT = "mtc-invoice-config-change";

export function getInvoiceConfig(): InvoiceConfig {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_CONFIG;
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_CONFIG;
  }
}

export function setInvoiceConfig(patch: Partial<InvoiceConfig>) {
  const next = { ...getInvoiceConfig(), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent(EVENT, { detail: next }));
  } catch {
    /* ignore */
  }
  return next;
}

/** Reactive hook — re-renders any consumer when the admin changes config. */
export function useInvoiceConfig(): InvoiceConfig {
  const [cfg, setCfg] = useState<InvoiceConfig>(getInvoiceConfig);
  useEffect(() => {
    const handler = () => setCfg(getInvoiceConfig());
    window.addEventListener(EVENT, handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener(EVENT, handler);
      window.removeEventListener("storage", handler);
    };
  }, []);
  return cfg;
}
