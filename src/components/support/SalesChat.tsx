import { useState } from "react";
import { Bot, MessageCircle, Send, X } from "lucide-react";
import { getSalesChatReply, supportPhone } from "./sales-chat";

type ChatMessage = { id: number; role: "assistant" | "user"; text: string };

const quickReplies = [
  { label: "Find an Africa plan", href: "#plans" },
  { label: "Check my device", href: "#device-check" },
  { label: "Business eSIMs", href: "/account" },
  {
    label: "Call support",
    href: supportPhone
      ? `tel:${supportPhone.replace(/[^+\d]/g, "")}`
      : "mailto:hello@elango.africa",
  },
];

export function SalesChat() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 1,
      role: "assistant",
      text: "Hi — I’m eLango’s AI sales assistant. I’m available 24/7 to help you choose an African eSIM plan. Where are you travelling?",
    },
  ]);

  const send = () => {
    const text = input.trim();
    if (!text) return;
    setMessages((current) => [
      ...current,
      { id: Date.now(), role: "user", text },
      { id: Date.now() + 1, role: "assistant", text: getSalesChatReply(text) },
    ]);
    setInput("");
  };

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-3">
      {open && (
        <section
          className="w-[min(calc(100vw-2rem),24rem)] overflow-hidden rounded-3xl border bg-card shadow-2xl"
          aria-label="eLango AI sales assistant"
        >
          <div className="flex items-center justify-between bg-foreground px-4 py-3 text-background">
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5" />
              <div>
                <p className="text-sm font-semibold">eLango AI assistant</p>
                <p className="text-xs opacity-75">24/7 plan guidance · AI, not a human</p>
              </div>
            </div>
            <button type="button" aria-label="Close chat" onClick={() => setOpen(false)}>
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="max-h-80 space-y-3 overflow-y-auto p-4" aria-live="polite">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`max-w-[90%] rounded-2xl px-3 py-2 text-sm ${
                  message.role === "user"
                    ? "ml-auto bg-primary text-primary-foreground"
                    : "bg-muted text-foreground"
                }`}
              >
                {message.text}
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2 border-t px-4 py-3">
            {quickReplies.map((quickReply) => (
              <a
                key={quickReply.href}
                href={quickReply.href}
                onClick={() => setOpen(false)}
                className="rounded-full border px-3 py-1.5 text-xs font-medium hover:bg-muted"
              >
                {quickReply.label}
              </a>
            ))}
          </div>
          <form
            className="flex gap-2 border-t p-3"
            onSubmit={(event) => {
              event.preventDefault();
              send();
            }}
          >
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Ask about a plan…"
              aria-label="Ask the eLango AI assistant"
              maxLength={240}
              className="min-w-0 flex-1 rounded-xl border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
            />
            <button
              type="submit"
              aria-label="Send message"
              className="rounded-xl bg-primary px-3 text-primary-foreground"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </section>
      )}
      <button
        type="button"
        className="flex items-center gap-2 rounded-full bg-foreground px-4 py-3 text-sm font-semibold text-background shadow-xl"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <MessageCircle className="h-5 w-5" />
        <span>Chat with AI</span>
      </button>
    </div>
  );
}
