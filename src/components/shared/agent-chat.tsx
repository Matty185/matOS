"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { Bot, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";

type ChatHistoryEntry = { role: "user" | "assistant"; content: string };

type PendingAction = {
  tool: string;
  label: string;
  memberName: string | null;
  endpoint: string;
  method: "POST" | "PATCH";
  body: Record<string, unknown>;
  requiresTypedConfirmation: boolean;
};

type DisplayItem =
  | { kind: "user"; text: string }
  | { kind: "answer"; text: string }
  | { kind: "error"; text: string }
  | {
      kind: "confirmation";
      text: string;
      actions: PendingAction[];
      query: string;
      status: "pending" | "executing" | "done" | "partial" | "cancelled";
    };

const CAPABILITIES_HINT =
  'Ask me about members, attendance, payments, classes, or belts — e.g. "who\'s overdue?" or "mark John Murphy paid for June."';

// Floating button (React portal, fixed position) -> Sheet chat panel, per
// plan §6. In-session history only: `history` lives in component state and
// is sent per request; nothing is persisted server-side beyond the
// audit_log row each /api/agent call already writes.
export function AgentChat() {
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<DisplayItem[]>([]);
  const [history, setHistory] = useState<ChatHistoryEntry[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [rateLimitWarning, setRateLimitWarning] = useState(false);
  const [rateLimitBlocked, setRateLimitBlocked] = useState(false);
  const [typedConfirmInputs, setTypedConfirmInputs] = useState<Record<number, string>>({});
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [items, loading]);

  async function handleSend() {
    const query = input.trim();
    if (!query || loading || rateLimitBlocked) return;
    setInput("");
    setItems((prev) => [...prev, { kind: "user", text: query }]);
    setLoading(true);

    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, conversation_history: history.slice(-20) }),
      });
      const data = await res.json();

      if (!res.ok) {
        if (data.code === "AGENT_RATE_LIMIT") setRateLimitBlocked(true);
        setItems((prev) => [
          ...prev,
          { kind: "error", text: data.error ?? "Something went wrong." },
        ]);
        return;
      }

      if (data.rate_limit_warning) setRateLimitWarning(true);

      if (data.type === "answer") {
        setItems((prev) => [...prev, { kind: "answer", text: data.content }]);
        setHistory((prev) => [
          ...prev,
          { role: "user", content: query },
          { role: "assistant", content: data.content },
        ]);
      } else if (data.type === "confirmation") {
        setItems((prev) => [
          ...prev,
          {
            kind: "confirmation",
            text: data.content,
            actions: data.tool_call,
            query,
            status: "pending",
          },
        ]);
        setHistory((prev) => [
          ...prev,
          { role: "user", content: query },
          { role: "assistant", content: data.content },
        ]);
      } else {
        setItems((prev) => [
          ...prev,
          { kind: "error", text: data.content ?? "Something went wrong." },
        ]);
      }
    } catch {
      setItems((prev) => [...prev, { kind: "error", text: "Something went wrong — try again." }]);
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirm(index: number) {
    const item = items[index];
    if (!item || item.kind !== "confirmation") return;

    setItems((prev) =>
      prev.map((it, i) =>
        i === index && it.kind === "confirmation" ? { ...it, status: "executing" } : it,
      ),
    );

    let allOk = true;
    for (const action of item.actions) {
      try {
        const res = await fetch(action.endpoint, {
          method: action.method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...action.body, agent_query: item.query }),
        });
        if (!res.ok) {
          allOk = false;
          const errBody = await res.json().catch(() => ({}));
          toast.error(errBody.error ?? "Something went wrong — the change wasn't saved.");
        }
      } catch {
        allOk = false;
        toast.error("Something went wrong — the change wasn't saved.");
      }
    }

    if (allOk) toast.success(item.actions.length > 1 ? "Done — all changes saved." : "Done.");

    setItems((prev) =>
      prev.map((it, i) =>
        i === index && it.kind === "confirmation"
          ? { ...it, status: allOk ? "done" : "partial" }
          : it,
      ),
    );
  }

  function handleCancel(index: number) {
    setItems((prev) =>
      prev.map((it, i) =>
        i === index && it.kind === "confirmation" ? { ...it, status: "cancelled" } : it,
      ),
    );
  }

  if (!mounted) return null;

  return (
    <>
      {createPortal(
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open assistant"
          className="fixed bottom-4 right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105"
        >
          <Bot className="h-6 w-6" />
        </button>,
        document.body,
      )}

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="flex w-full flex-col p-0 sm:max-w-md">
          <SheetHeader className="border-b p-4 text-left">
            <SheetTitle className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-primary" /> Assistant
            </SheetTitle>
            <SheetDescription>{CAPABILITIES_HINT}</SheetDescription>
          </SheetHeader>

          {rateLimitBlocked ? (
            <div className="border-b bg-destructive/10 p-3 text-sm text-destructive">
              You&apos;ve reached today&apos;s limit of 50 queries. It resets at midnight.
            </div>
          ) : rateLimitWarning ? (
            <div className="border-b bg-secondary p-3 text-sm">
              You&apos;re approaching today&apos;s query limit (50/day).
            </div>
          ) : null}

          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto p-4"
            aria-live="polite"
            aria-atomic="false"
          >
            {items.length === 0 ? (
              <p className="text-sm text-muted-foreground">{CAPABILITIES_HINT}</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {items.map((item, index) => (
                  <li key={index}>
                    {item.kind === "user" ? (
                      <div className="ml-auto max-w-[85%] rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground">
                        {item.text}
                      </div>
                    ) : item.kind === "answer" ? (
                      <div className="max-w-[85%] rounded-md bg-muted px-3 py-2 text-sm">
                        {item.text}
                      </div>
                    ) : item.kind === "error" ? (
                      <div className="max-w-[85%] rounded-md border border-destructive/50 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                        {item.text}
                      </div>
                    ) : (
                      <div
                        className={`max-w-[95%] rounded-md border p-3 text-sm ${
                          item.actions.some((a) => a.requiresTypedConfirmation)
                            ? "border-destructive/50 bg-destructive/5"
                            : ""
                        }`}
                      >
                        <p className="mb-2">{item.text}</p>
                        <ul className="mb-3 flex flex-col gap-1.5">
                          {item.actions.map((action, actionIndex) => (
                            <li
                              key={actionIndex}
                              className="flex items-center justify-between gap-2 rounded-md bg-muted px-2 py-1.5 text-xs"
                            >
                              <span>
                                {action.label}
                                {action.memberName ? ` — ${action.memberName}` : ""}
                              </span>
                              {action.requiresTypedConfirmation ? (
                                <Badge variant="destructive">destructive</Badge>
                              ) : null}
                            </li>
                          ))}
                        </ul>

                        {item.status === "pending" ? (
                          <div className="flex flex-col gap-2">
                            {item.actions.some((a) => a.requiresTypedConfirmation) ? (
                              <div className="flex flex-col gap-1.5">
                                <label className="text-xs text-muted-foreground">
                                  Type &quot;yes&quot; or &quot;confirm&quot; to proceed — this
                                  deactivates a member.
                                </label>
                                <Input
                                  className="h-11"
                                  value={typedConfirmInputs[index] ?? ""}
                                  onChange={(e) =>
                                    setTypedConfirmInputs((prev) => ({
                                      ...prev,
                                      [index]: e.target.value,
                                    }))
                                  }
                                />
                              </div>
                            ) : null}
                            <div className="flex gap-2">
                              <Button
                                className="h-11 flex-1"
                                disabled={
                                  item.actions.some((a) => a.requiresTypedConfirmation) &&
                                  !/^(yes|confirm)$/i.test((typedConfirmInputs[index] ?? "").trim())
                                }
                                onClick={() => handleConfirm(index)}
                              >
                                Confirm
                              </Button>
                              <Button
                                variant="outline"
                                className="h-11 flex-1"
                                onClick={() => handleCancel(index)}
                              >
                                Cancel
                              </Button>
                            </div>
                          </div>
                        ) : item.status === "executing" ? (
                          <p className="text-xs text-muted-foreground">Saving...</p>
                        ) : item.status === "done" ? (
                          <p className="text-xs text-muted-foreground">Confirmed.</p>
                        ) : item.status === "partial" ? (
                          <p className="text-xs text-destructive">
                            {item.actions.length > 1
                              ? "Some changes couldn't be saved — see the error above."
                              : "This change couldn't be saved — see the error above."}
                          </p>
                        ) : (
                          <p className="text-xs text-muted-foreground">Cancelled.</p>
                        )}
                      </div>
                    )}
                  </li>
                ))}
                {loading ? (
                  <li className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Thinking...
                  </li>
                ) : null}
              </ul>
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="flex gap-2 border-t p-3"
          >
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask a question..."
              className="h-11"
              disabled={rateLimitBlocked || loading}
            />
            <Button type="submit" className="h-11 w-11 p-0" disabled={loading || rateLimitBlocked}>
              <Send className="h-4 w-4" />
              <span className="sr-only">Send</span>
            </Button>
          </form>
        </SheetContent>
      </Sheet>
    </>
  );
}
