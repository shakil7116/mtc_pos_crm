import { useState, useRef, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Sparkles, Send, User, Loader2, MessageCircle, Info, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

type Msg = { role: "user" | "assistant"; content: string };

type Draft = {
  customerId: number;
  customerName: string;
  phone: string;
  purpose: string;
  message: string;
};

/** Attached to the assistant turn that produced it, so scrolling back keeps the pairing. */
type Turn = Msg & { draft?: Draft | null; tools?: { name: string }[]; by?: string };

const SUGGESTIONS = [
  "What is Ahmed Construction's total credit outstanding?",
  "Who owes us the most money right now?",
  "Which products sold the most in the last 30 days?",
  "What is low on stock?",
];

// Minimal markdown: bold, and pipe tables, which is all the assistant is told to emit.
function renderText(text: string) {
  const lines = text.split("\n");
  const out: JSX.Element[] = [];
  let table: string[] = [];

  const flushTable = (key: number) => {
    if (!table.length) return;
    const rows = table
      .filter((r) => !/^\s*\|?[\s:|-]+\|?\s*$/.test(r))
      .map((r) => r.replace(/^\||\|$/g, "").split("|").map((c) => c.trim()));
    if (rows.length) {
      const [head, ...body] = rows;
      out.push(
        <div key={`t${key}`} className="my-2 overflow-x-auto">
          <table className="text-[13px] w-full border-collapse">
            <thead>
              <tr>{head.map((h, i) => (
                <th key={i} className="text-left font-semibold px-2.5 py-1.5 border-b border-border whitespace-nowrap">{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {body.map((r, ri) => (
                <tr key={ri} className="border-b border-border/50 last:border-0">
                  {r.map((c, ci) => <td key={ci} className="px-2.5 py-1.5 whitespace-nowrap">{inline(c)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
    }
    table = [];
  };

  const inline = (s: string) => {
    const parts = s.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).filter(Boolean);
    return parts.map((p, i) =>
      /^\*\*[^*]+\*\*$/.test(p) ? <strong key={i}>{p.slice(2, -2)}</strong>
      : /^\*[^*]+\*$/.test(p) ? <strong key={i}>{p.slice(1, -1)}</strong>
      : <span key={i}>{p}</span>,
    );
  };

  lines.forEach((line, i) => {
    if (line.trim().startsWith("|")) { table.push(line); return; }
    flushTable(i);
    if (!line.trim()) { out.push(<div key={i} className="h-2" />); return; }
    const bullet = line.match(/^\s*[-•*]\s+(.*)$/);
    out.push(
      bullet
        ? <div key={i} className="flex gap-2 leading-relaxed"><span className="text-muted-foreground">•</span><span>{inline(bullet[1])}</span></div>
        : <div key={i} className="leading-relaxed">{inline(line)}</div>,
    );
  });
  flushTable(lines.length);
  return out;
}

export default function Assistant() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [sentDrafts, setSentDrafts] = useState<Set<number>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: status } = useQuery<{ available: boolean; modelAvailable: boolean; provider: string; capabilities: string[] }>({
    queryKey: ["/api/assistant/status"],
    queryFn: () => fetch("/api/assistant/status").then((r) => r.json()),
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [turns]);

  const chat = useMutation({
    mutationFn: async (history: Msg[]) => {
      const res = await fetch("/api/assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Only the plain conversation goes up — drafts and tool traces are local.
        body: JSON.stringify({ messages: history.map((m) => ({ role: m.role, content: m.content })) }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.message || "The assistant could not answer.");
      return body as { reply: string; draft?: Draft | null; toolsUsed?: { name: string }[]; answeredBy?: string };
    },
    onSuccess: (data) => {
      setTurns((t) => [...t, { role: "assistant", content: data.reply, draft: data.draft, tools: data.toolsUsed, by: data.answeredBy }]);
    },
    onError: (e: any) => {
      setTurns((t) => [...t, { role: "assistant", content: `⚠️ ${e.message}` }]);
    },
  });

  const sendWhatsapp = useMutation({
    mutationFn: async ({ draft, index }: { draft: Draft; index: number }) => {
      const res = await fetch("/api/assistant/send-whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId: draft.customerId, phone: draft.phone, message: draft.message }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.message || "Send failed.");
      return index;
    },
    onSuccess: (index) => {
      setSentDrafts((s) => new Set(s).add(index));
      qc.invalidateQueries({ queryKey: ["/api/messages"] });
      toast({ title: "WhatsApp sent" });
    },
    onError: (e: any) => toast({ title: "Could not send", description: e.message, variant: "destructive" }),
  });

  function ask(text: string) {
    const q = text.trim();
    if (!q || chat.isPending) return;
    const next: Turn[] = [...turns, { role: "user", content: q }];
    setTurns(next);
    setInput("");
    chat.mutate(next.map(({ role, content }) => ({ role, content })));
  }

  // The draft is editable before sending — the assistant writes a starting point,
  // not the final word.
  function editDraft(index: number, message: string) {
    setTurns((t) => t.map((turn, i) => (i === index && turn.draft ? { ...turn, draft: { ...turn.draft, message } } : turn)));
  }

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto flex flex-col h-[calc(100vh-4rem)]">
      <div className="page-header shrink-0">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-violet-50 to-indigo-50 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-violet-600" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">AI Overview</h1>
          </div>
          <p className="text-[13px] text-muted-foreground mt-0.5">
            Ask about customers, stock, sales and money — then send the message that follows.
          </p>
        </div>
        {turns.length > 0 && (
          <Button variant="outline" size="sm" onClick={() => { setTurns([]); setSentDrafts(new Set()); }}>
            New chat
          </Button>
        )}
      </div>

      {status && !status.modelAvailable && (
        <div className="flex items-start gap-2.5 rounded-xl border border-sky-200 bg-sky-50 p-3.5 text-[13px] text-sky-900 mb-4">
          <Info className="w-4 h-4 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">Running on built-in rules — no AI key needed</p>
            <p>
              Everything in the list below works right now. An AI key
              (<code className="font-mono">GROQ_API_KEY</code> or <code className="font-mono">ANTHROPIC_API_KEY</code> in{" "}
              <code className="font-mono">.env</code>) is only needed for phrasing outside these questions.
            </p>
          </div>
        </div>
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-4 pr-1">
        {turns.length === 0 && (
          <div className="pt-6">
            <p className="text-[13px] font-medium text-muted-foreground mb-3">Try asking</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {(status?.capabilities?.length ? status.capabilities : SUGGESTIONS).map((s) => (
                <button
                  key={s}
                  onClick={() => ask(s.replace(/\*/g, ""))}
                  className="text-left text-[13px] rounded-xl border border-border hover:border-violet-300 hover:bg-violet-50/50 px-3.5 py-3 transition-colors"
                >
                  {s.replace(/\*/g, "")}
                </button>
              ))}
            </div>
          </div>
        )}

        {turns.map((turn, i) => (
          <div key={i} className={cn("flex gap-3", turn.role === "user" && "justify-end")}>
            {turn.role === "assistant" && (
              <div className="w-7 h-7 rounded-lg bg-violet-100 flex items-center justify-center shrink-0 mt-0.5">
                <Sparkles className="w-3.5 h-3.5 text-violet-600" />
              </div>
            )}
            <div className={cn("max-w-[85%] space-y-2", turn.role === "user" && "order-first")}>
              <div
                className={cn(
                  "rounded-2xl px-4 py-2.5 text-sm",
                  turn.role === "user" ? "bg-[#1e2a3a] text-white" : "bg-muted/50",
                )}
              >
                {turn.role === "user" ? turn.content : <div className="space-y-0.5">{renderText(turn.content)}</div>}
              </div>

              {(!!turn.tools?.length || turn.by) && (
                <div className="flex flex-wrap gap-1 items-center">
                  {turn.tools?.map((t, ti) => (
                    <Badge key={ti} variant="outline" className="text-[10px] font-normal text-muted-foreground">
                      {t.name.replace(/_/g, " ")}
                    </Badge>
                  ))}
                  {turn.by && (
                    <span className="text-[10px] text-muted-foreground">
                      {turn.by === "rules" ? "answered from your data, no AI" : `via ${turn.by}`}
                    </span>
                  )}
                </div>
              )}

              {turn.draft && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-3.5 space-y-2.5">
                  <div className="flex items-center gap-2 text-[13px] font-medium text-emerald-900">
                    <MessageCircle className="w-4 h-4" />
                    WhatsApp draft — {turn.draft.customerName}
                    <span className="font-normal text-emerald-700">{turn.draft.phone}</span>
                  </div>
                  <Textarea
                    value={turn.draft.message}
                    onChange={(e) => editDraft(i, e.target.value)}
                    rows={8}
                    disabled={sentDrafts.has(i)}
                    className="text-[13px] bg-white font-normal"
                  />
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] text-emerald-800">
                      {sentDrafts.has(i) ? "Sent." : "Nothing is sent until you press Send. Edit freely first."}
                    </p>
                    <Button
                      size="sm"
                      disabled={sentDrafts.has(i) || sendWhatsapp.isPending}
                      onClick={() => sendWhatsapp.mutate({ draft: turn.draft!, index: i })}
                      className="gap-2 bg-emerald-600 hover:bg-emerald-700"
                    >
                      {sentDrafts.has(i)
                        ? <><Check className="w-3.5 h-3.5" /> Sent</>
                        : sendWhatsapp.isPending
                          ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Sending…</>
                          : <><Send className="w-3.5 h-3.5" /> Send WhatsApp</>}
                    </Button>
                  </div>
                </div>
              )}
            </div>
            {turn.role === "user" && (
              <div className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center shrink-0 mt-0.5">
                <User className="w-3.5 h-3.5 text-muted-foreground" />
              </div>
            )}
          </div>
        ))}

        {chat.isPending && (
          <div className="flex gap-3">
            <div className="w-7 h-7 rounded-lg bg-violet-100 flex items-center justify-center shrink-0">
              <Sparkles className="w-3.5 h-3.5 text-violet-600" />
            </div>
            <div className="rounded-2xl px-4 py-2.5 bg-muted/50 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Looking it up…
            </div>
          </div>
        )}
      </div>

      <div className="shrink-0 pt-4">
        <div className="flex gap-2 items-end">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              // Enter sends; Shift+Enter is a newline, as everywhere else.
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(input); }
            }}
            placeholder={`Ask anything about the business, ${user?.name?.split(" ")[0] || "there"}…`}
            rows={1}
            className="resize-none min-h-[44px] max-h-32 rounded-xl"
            disabled={chat.isPending}
          />
          <Button
            onClick={() => ask(input)}
            disabled={!input.trim() || chat.isPending}
            className="h-[44px] px-4 rounded-xl shrink-0"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground mt-2">
          Figures come from your live data. The assistant never sends anything without you pressing Send.
        </p>
      </div>
    </div>
  );
}
