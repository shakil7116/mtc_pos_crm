// ─────────────────────────────────────────────────────────────────────────────
// AI Overview endpoints — the chat loop, and the separate confirmed-send route.
//
// The provider is deliberately behind one function. Groq is the default because
// GROQ_API_KEY is already configured and costs nothing at this volume; setting
// ANTHROPIC_API_KEY switches the reasoning to Claude without touching anything
// else. Both speak the same tool-calling shape used below.
// ─────────────────────────────────────────────────────────────────────────────
import type { Express, Request, Response } from "express";
import { TOOL_DEFS, runTool, systemPrompt, type AssistantUser } from "./assistant";
import { normalizeRole } from "@shared/permissions";
import { getCustomer, logMessage } from "./storage";
import { routeQuestion, CAPABILITY_LIST } from "./assistantRouter";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

// Tool-calling quality matters more here than raw speed — this model has to pick
// the right lookup and know when to ask a question instead of guessing.
const GROQ_MODEL = process.env.AI_CHAT_MODEL || "llama-3.3-70b-versatile";
const CLAUDE_MODEL = process.env.AI_CHAT_MODEL || "claude-opus-5";

/** Hard stop on the tool loop so a confused model cannot spin up a bill. */
const MAX_TOOL_ROUNDS = 6;

type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: any[];
  tool_call_id?: string;
  name?: string;
};

function useClaude(): boolean {
  return !!(process.env.ANTHROPIC_API_KEY || "").trim();
}

/** A blank value in .env is the same as no key at all. */
function hasModelKey(): boolean {
  return !!((process.env.GROQ_API_KEY || "").trim() || (process.env.ANTHROPIC_API_KEY || "").trim());
}

/**
 * One model turn. Returns the assistant message in OpenAI shape regardless of
 * provider, so the loop below does not care which one answered.
 */
async function callModel(messages: ChatMessage[]): Promise<any> {
  if (useClaude()) {
    // Anthropic's Messages API keeps the system prompt out of the array and
    // names things differently; translate both ways.
    const system = messages.find((m) => m.role === "system")?.content || "";
    const converted: any[] = [];
    for (const m of messages) {
      if (m.role === "system") continue;
      if (m.role === "tool") {
        converted.push({
          role: "user",
          content: [{ type: "tool_result", tool_use_id: m.tool_call_id, content: m.content || "" }],
        });
      } else if (m.role === "assistant" && m.tool_calls?.length) {
        const blocks: any[] = [];
        if (m.content) blocks.push({ type: "text", text: m.content });
        for (const tc of m.tool_calls) {
          blocks.push({
            type: "tool_use",
            id: tc.id,
            name: tc.function.name,
            input: JSON.parse(tc.function.arguments || "{}"),
          });
        }
        converted.push({ role: "assistant", content: blocks });
      } else {
        converted.push({ role: m.role, content: m.content || "" });
      }
    }

    const res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "x-api-key": process.env.ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 4096,
        system,
        messages: converted,
        tools: TOOL_DEFS.map((t) => ({
          name: t.function.name,
          description: t.function.description,
          input_schema: t.function.parameters,
        })),
      }),
    });
    const data: any = await res.json();
    if (!res.ok) throw new Error(data?.error?.message || `Claude error ${res.status}`);

    const text = (data.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("");
    const toolUses = (data.content || []).filter((b: any) => b.type === "tool_use");
    return {
      content: text || null,
      tool_calls: toolUses.length
        ? toolUses.map((b: any) => ({
            id: b.id,
            type: "function",
            function: { name: b.name, arguments: JSON.stringify(b.input || {}) },
          }))
        : undefined,
    };
  }

  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages,
      tools: TOOL_DEFS,
      tool_choice: "auto",
      temperature: 0.2,
// Low temperature: this job is lookup and reporting, not writing.
    }),
  });
  const data: any = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `Groq error ${res.status}`);
  return data.choices?.[0]?.message;
}

export function registerAssistantRoutes(app: Express): void {
  app.get("/api/assistant/status", (_req: Request, res: Response) => {
    // The page is always usable: the rule-based router needs no key. A model key
    // only widens what phrasing it understands.
    res.json({
      available: true,
      modelAvailable: hasModelKey(),
      provider: useClaude() ? "claude" : hasModelKey() ? "groq" : "rules",
      capabilities: CAPABILITY_LIST,
    });
  });

  app.post("/api/assistant/chat", async (req: Request, res: Response) => {
    if (!req.user) return res.status(401).json({ message: "Sign in first." });

    const user: AssistantUser = {
      id: req.user.id,
      name: req.user.name || "there",
      role: normalizeRole(req.user.role),
      storeId: req.user.storeId ?? null,
    };

    try {
      const history: ChatMessage[] = Array.isArray(req.body?.messages) ? req.body.messages : [];
      // Only role+content from the client is trusted; the system prompt is built
      // server-side every time so the browser can never widen its own access.
      const clean: ChatMessage[] = history
        .filter((m: any) => ["user", "assistant"].includes(m?.role) && typeof m?.content === "string")
        .slice(-20)
        .map((m: any) => ({ role: m.role, content: m.content }));

      if (!clean.length) return res.status(400).json({ message: "Nothing to answer." });

      // Rules first. Most questions here are the same handful asked in slightly
      // different words, and answering those from a lookup table is free,
      // instant, and cannot hallucinate. The model is the fallback, not the path.
      const lastUser = [...clean].reverse().find((m) => m.role === "user");
      if (lastUser?.content) {
        const routed = await routeQuestion(lastUser.content, user);
        if (routed.handled) {
          return res.json({
            reply: routed.reply,
            toolsUsed: routed.toolsUsed,
            draft: routed.draft ?? null,
            answeredBy: "rules",
          });
        }
      }

      // Nothing matched and there is no model to fall back on — say what IS
      // answerable rather than failing blankly.
      if (!hasModelKey()) {
        return res.json({
          reply: [
            "I couldn't match that to anything I know how to look up. I can answer:",
            "",
            ...CAPABILITY_LIST.map((c) => `- ${c}`),
            "",
            "For free-form phrasing beyond these, add an AI key to .env.",
          ].join("\n"),
          toolsUsed: [],
          draft: null,
          answeredBy: "rules",
        });
      }

      const messages: ChatMessage[] = [
        { role: "system", content: systemPrompt(user) },
        ...clean,
      ];

      const toolTrace: { name: string; args: any }[] = [];
      let draft: any = null;

      for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        const reply = await callModel(messages);
        if (!reply) throw new Error("Empty response from the model.");

        if (!reply.tool_calls?.length) {
          return res.json({
            reply: reply.content || "I could not work that out.",
            toolsUsed: toolTrace,
            draft,
            answeredBy: useClaude() ? "claude" : "groq",
          });
        }

        messages.push({ role: "assistant", content: reply.content ?? null, tool_calls: reply.tool_calls });

        for (const call of reply.tool_calls) {
          let args: any = {};
          // Models occasionally emit malformed JSON here — a bad argument blob
          // should surface to the model as a tool error, not crash the request.
          try { args = JSON.parse(call.function.arguments || "{}"); } catch { args = {}; }

          const result = await runTool(call.function.name, args, user);
          toolTrace.push({ name: call.function.name, args });
          if (result?.draft) draft = result.draft;

          messages.push({
            role: "tool",
            tool_call_id: call.id,
            name: call.function.name,
            content: JSON.stringify(result).slice(0, 12_000),
          });
        }
      }

      res.json({
        reply: "That needed more lookups than I'm allowed in one go. Try asking it in smaller pieces.",
        toolsUsed: toolTrace,
        draft,
      });
    } catch (e) {
      console.error("assistant chat error:", e);
      res.status(500).json({ message: e instanceof Error ? e.message : String(e) });
    }
  });

  // The only path that actually sends. Separate from the chat loop on purpose:
  // the model can compose a message but has no route that transmits one, so a
  // send is always a deliberate human action.
  app.post("/api/assistant/send-whatsapp", async (req: Request, res: Response) => {
    if (!req.user) return res.status(401).json({ message: "Sign in first." });
    const role = normalizeRole(req.user.role);
    if (!["admin", "manager", "salesman"].includes(role)) {
      return res.status(403).json({ message: "Your role cannot send customer messages." });
    }

    const { customerId, phone, message } = req.body || {};
    if (!message || !String(message).trim()) return res.status(400).json({ message: "Nothing to send." });

    const customer = customerId ? await getCustomer(Number(customerId)) : null;
    // Trust the customer record over anything posted back from the browser.
    const to = customer?.phone || phone;
    if (!to) return res.status(400).json({ message: "No phone number for this customer." });

    try {
      const twilio = (await import("twilio")).default(
        process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN,
      );
      await twilio.messages.create({
        from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER || process.env.TWILIO_PHONE_NUMBER}`,
        to: `whatsapp:${to}`,
        body: String(message),
      });

      // Same log the Messages page reads, so an assistant-sent reminder shows up
      // in the customer's message history like any other.
      try {
        await logMessage({
          customerId: customer?.id,
          type: "whatsapp",
          content: String(message),
          sentBy: req.user.id,
        });
      } catch { /* logging must never fail the send */ }

      res.json({ ok: true, sentTo: to });
    } catch (e) {
      console.error("assistant whatsapp send failed:", e);
      res.status(500).json({ message: `Could not send: ${e instanceof Error ? e.message : String(e)}` });
    }
  });
}
