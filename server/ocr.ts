// ─────────────────────────────────────────────────────────────────────────────
// Getting text out of a file — provider-agnostic, and mostly provider-free.
//
// Text-bearing files (CSV, TXT, and any PDF with a real text layer) are read
// here with no model and no key. Only a photo or a scanned page needs a vision
// provider, and that provider is asked to do ONE thing: transcribe what it sees,
// preserving the column spacing. It is never asked to produce JSON, split
// columns, or decide what a product is — that failed in practice, and
// server/lineParser.ts does it deterministically instead.
//
// Adding a provider is one entry in PROVIDERS. Nothing else in the app knows or
// cares which one is configured, so the key can be chosen later.
// ─────────────────────────────────────────────────────────────────────────────

/** The only instruction any vision provider gets. Deliberately narrow. */
const TRANSCRIBE_PROMPT =
  "Transcribe the items table from this document as plain text. " +
  "Keep each product on its own line and preserve the spacing between columns so the columns stay aligned. " +
  "Include the description, quantity, unit and prices exactly as printed. " +
  "Do not summarise, do not reformat as JSON, do not add or remove rows, do not translate. " +
  "Output only the transcribed lines.";

export interface OcrProvider {
  id: string;
  label: string;
  /** Env var holding the key. */
  keyVar: string;
  /** Extra note shown in the UI. */
  note: string;
  transcribe: (base64: string, mimeType: string, model?: string) => Promise<string>;
}

async function openAiCompatible(
  url: string, key: string, model: string, base64: string, mimeType: string,
): Promise<string> {
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [{
        role: "user",
        content: [
          { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}` } },
          { type: "text", text: TRANSCRIBE_PROMPT },
        ],
      }],
      temperature: 0,
      max_tokens: 4000,
    }),
  });
  const data: any = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `Vision request failed (${res.status})`);
  return String(data.choices?.[0]?.message?.content || "");
}

export const PROVIDERS: OcrProvider[] = [
  {
    id: "anthropic",
    label: "Claude",
    keyVar: "ANTHROPIC_API_KEY",
    note: "Strongest on faint scans and mixed Arabic/English. Paid per page.",
    transcribe: async (base64, mimeType, model) => {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": process.env.ANTHROPIC_API_KEY!,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: model || process.env.OCR_MODEL || "claude-opus-5",
          max_tokens: 4000,
          messages: [{
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: mimeType, data: base64 } },
              { type: "text", text: TRANSCRIBE_PROMPT },
            ],
          }],
        }),
      });
      const data: any = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || `Claude vision failed (${res.status})`);
      return (data.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("");
    },
  },
  {
    id: "openai",
    label: "OpenAI",
    keyVar: "OPENAI_API_KEY",
    note: "Solid general transcription.",
    transcribe: (b, m, model) => openAiCompatible(
      "https://api.openai.com/v1/chat/completions",
      process.env.OPENAI_API_KEY!, model || process.env.OCR_MODEL || "gpt-4o", b, m),
  },
  {
    id: "google",
    label: "Gemini",
    keyVar: "GOOGLE_API_KEY",
    note: "Generous free tier.",
    transcribe: async (base64, mimeType, model) => {
      const m = model || process.env.OCR_MODEL || "gemini-2.0-flash";
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${process.env.GOOGLE_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ inline_data: { mime_type: mimeType, data: base64 } }, { text: TRANSCRIBE_PROMPT }] }],
            generationConfig: { temperature: 0 },
          }),
        });
      const data: any = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || `Gemini vision failed (${res.status})`);
      return String(data.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join("") || "");
    },
  },
  {
    id: "groq",
    label: "Groq",
    keyVar: "GROQ_API_KEY",
    note: "Free and fast, but weakest at keeping table columns apart on this kind of document.",
    transcribe: (b, m, model) => openAiCompatible(
      "https://api.groq.com/openai/v1/chat/completions",
      process.env.GROQ_API_KEY!, model || process.env.OCR_MODEL || "meta-llama/llama-4-scout-17b-16e-instruct", b, m),
  },
];

const keyPresent = (v: string) => !!(process.env[v] || "").trim();

/**
 * The provider to use. `OCR_PROVIDER` pins one explicitly; otherwise the first
 * one with a key wins, in the order above (best transcription first).
 */
export function activeProvider(): OcrProvider | null {
  const pinned = (process.env.OCR_PROVIDER || "").trim().toLowerCase();
  if (pinned) {
    const p = PROVIDERS.find((x) => x.id === pinned);
    return p && keyPresent(p.keyVar) ? p : null;
  }
  return PROVIDERS.find((p) => keyPresent(p.keyVar)) || null;
}

export function ocrStatus() {
  const active = activeProvider();
  return {
    // Text files and text-layer PDFs never needed a provider.
    textExtraction: true,
    imageExtraction: !!active,
    activeProvider: active ? { id: active.id, label: active.label } : null,
    providers: PROVIDERS.map((p) => ({
      id: p.id, label: p.label, keyVar: p.keyVar, note: p.note, configured: keyPresent(p.keyVar),
    })),
  };
}

export interface ExtractResult {
  text: string;
  /** How the text was obtained, for showing the user what happened. */
  source: "plain-text" | "pdf-text-layer" | "vision";
  provider?: string;
  warnings: string[];
}

/** Read a PDF's embedded text layer. Pure JS — no poppler, no shelling out. */
async function pdfText(buffer: Buffer): Promise<string> {
  const mod: any = await import("pdf-parse");
  const fn = mod.default ?? mod.pdf ?? mod;
  const out = await (typeof fn === "function" ? fn(buffer) : mod.pdf(buffer));
  return String(out?.text || "");
}

/**
 * Get text out of an uploaded file, using a model only when there is no other way.
 * Throws a plain-language error when an image arrives with no provider configured.
 */
export async function extractText(
  buffer: Buffer, filename: string, mimeType?: string,
): Promise<ExtractResult> {
  const ext = (filename.split(".").pop() || "").toLowerCase();
  const warnings: string[] = [];

  if (["csv", "txt", "tsv", "text"].includes(ext)) {
    return { text: buffer.toString("utf8"), source: "plain-text", warnings };
  }

  if (ext === "pdf") {
    let text = "";
    try {
      text = await pdfText(buffer);
    } catch (e) {
      warnings.push(`Could not read the PDF's text layer: ${e instanceof Error ? e.message : String(e)}`);
    }
    // A scan saved as PDF has no text layer — only then is a model needed.
    if (text.trim().length > 40) {
      return { text, source: "pdf-text-layer", warnings };
    }
    warnings.push("This PDF has no selectable text — it is a scan, so it needs image transcription.");
    const provider = activeProvider();
    if (!provider) {
      throw new Error(
        "This PDF is a scanned image and no OCR provider is configured. "
        + "Add one of ANTHROPIC_API_KEY, OPENAI_API_KEY, GOOGLE_API_KEY or GROQ_API_KEY to .env, "
        + "or export the invoice as CSV/text.",
      );
    }
    // Hand the PDF straight to the provider; the ones supported take PDFs or
    // images, and re-rasterising here would need native tooling we deliberately
    // avoid on Windows.
    const text2 = await provider.transcribe(buffer.toString("base64"), "application/pdf");
    return { text: text2, source: "vision", provider: provider.label, warnings };
  }

  if (["png", "jpg", "jpeg", "webp", "gif", "bmp"].includes(ext)) {
    const provider = activeProvider();
    if (!provider) {
      throw new Error(
        "No OCR provider is configured, so images cannot be read yet. "
        + "Add one of ANTHROPIC_API_KEY, OPENAI_API_KEY, GOOGLE_API_KEY or GROQ_API_KEY to .env and restart. "
        + "CSV, TXT and text-based PDFs work without one.",
      );
    }
    const mt = mimeType && mimeType.startsWith("image/")
      ? mimeType
      : ext === "jpg" ? "image/jpeg" : `image/${ext}`;
    const text = await provider.transcribe(buffer.toString("base64"), mt);
    return { text, source: "vision", provider: provider.label, warnings };
  }

  throw new Error(`Unsupported file type ".${ext}". Use CSV, TXT, PDF, or an image.`);
}
