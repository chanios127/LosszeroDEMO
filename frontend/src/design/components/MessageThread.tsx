import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ChatMessage, VizHint } from "../types/events";
import { CollapsibleTrace } from "./AgentTrace";
import { InlineViz } from "./VizPanel";
import { Dot } from "./primitives";
import { IconSparkle } from "./icons";

interface MessageThreadProps {
  messages: ChatMessage[];
}

type ContentSegment =
  | { type: "think"; content: string; closed: boolean }
  | { type: "text"; content: string };

function parseContent(raw: string): ContentSegment[] {
  const segments: ContentSegment[] = [];
  const thinkOpen = /<think>/gi;
  const thinkClose = /<\/think>/gi;
  let cursor = 0;

  let openMatch: RegExpExecArray | null;
  thinkOpen.lastIndex = 0;

  while ((openMatch = thinkOpen.exec(raw)) !== null) {
    const openStart = openMatch.index;
    const contentStart = openStart + openMatch[0].length;
    if (openStart > cursor) {
      segments.push({ type: "text", content: raw.slice(cursor, openStart) });
    }
    thinkClose.lastIndex = contentStart;
    const closeMatch = thinkClose.exec(raw);
    if (closeMatch) {
      segments.push({
        type: "think",
        content: raw.slice(contentStart, closeMatch.index),
        closed: true,
      });
      cursor = closeMatch.index + closeMatch[0].length;
      thinkOpen.lastIndex = cursor;
    } else {
      segments.push({
        type: "think",
        content: raw.slice(contentStart),
        closed: false,
      });
      cursor = raw.length;
      break;
    }
  }

  if (cursor < raw.length) {
    segments.push({ type: "text", content: raw.slice(cursor) });
  }

  return segments;
}

function ThinkBlock({
  content,
  closed,
  isStreaming,
}: {
  content: string;
  closed: boolean;
  isStreaming?: boolean;
}) {
  // Auto-expand while the model is actively thinking — gives the user
  // visual progress instead of an opaque "처리 중...". Auto-collapse once
  // the think block closes so the final answer takes focus.
  const [open, setOpen] = useState<boolean>(
    Boolean(isStreaming && !closed),
  );
  const userToggledRef = useRef(false);

  useEffect(() => {
    // Don't override the user's manual toggle.
    if (userToggledRef.current) return;
    setOpen(Boolean(isStreaming && !closed));
  }, [isStreaming, closed]);

  const handleToggle = () => {
    userToggledRef.current = true;
    setOpen((v) => !v);
  };

  return (
    <div
      style={{
        background: "var(--bg-elev-1)",
        border: "1px dashed var(--border-subtle)",
        borderRadius: 8,
      }}
    >
      <button
        onClick={handleToggle}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          width: "100%",
          padding: "6px 10px",
          fontSize: 11,
          color: "var(--text-muted)",
        }}
      >
        <span style={{ color: "var(--text-faint)" }}>
          {open ? "▾" : "▸"}
        </span>
        <span className="mono" style={{ fontWeight: 500 }}>
          {closed ? "생각 과정" : "생각 중..."}
        </span>
        {!closed && isStreaming && <Dot tone="brand" pulse />}
        <span
          style={{
            marginLeft: "auto",
            color: "var(--text-faint)",
          }}
        >
          {open ? "접기" : "펼치기"}
        </span>
      </button>
      {open && (
        <div
          style={{
            padding: "8px 12px 10px 24px",
            borderTop: "1px solid var(--border-subtle)",
            fontSize: 12,
            color: "var(--text-muted)",
            whiteSpace: "pre-wrap",
            lineHeight: 1.5,
          }}
        >
          {content}
        </div>
      )}
    </div>
  );
}

function UserBubble({ msg }: { msg: ChatMessage }) {
  return (
    <div
      className="fade-in"
      style={{
        display: "flex",
        justifyContent: "flex-end",
        marginBottom: 20,
      }}
    >
      <div
        style={{
          maxWidth: "72%",
          padding: "10px 14px",
          background: "color-mix(in oklch, var(--brand-500) 14%, transparent)",
          border: "1px solid color-mix(in oklch, var(--brand-500) 22%, transparent)",
          color: "var(--text-strong)",
          borderRadius: "var(--r-lg) var(--r-lg) 4px var(--r-lg)",
          fontSize: 14,
          lineHeight: 1.55,
          whiteSpace: "pre-wrap",
        }}
      >
        {msg.content}
      </div>
    </div>
  );
}

function AssistantBubble({ msg }: { msg: ChatMessage }) {
  const segments = parseContent(msg.content ?? "");
  const thinkSegments = segments.filter(
    (s): s is Extract<ContentSegment, { type: "think" }> => s.type === "think",
  );
  const textSegments = segments.filter((s) => s.type === "text");
  const hasVisibleText = textSegments.some(
    (s) => s.content.trim().length > 0,
  );

  return (
    <div
      className="fade-in"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        marginBottom: 24,
        alignItems: "flex-start",
        maxWidth: "86%",
      }}
    >
      {/* Header: avatar + eyebrow */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div
          style={{
            width: 24,
            height: 24,
            borderRadius: 6,
            background:
              "linear-gradient(135deg, var(--brand-400), var(--brand-600))",
            display: "grid",
            placeItems: "center",
            color: "#0a0a0a",
          }}
        >
          <IconSparkle />
        </div>
        <span
          className="mono"
          style={{
            fontSize: 10,
            color: "var(--text-faint)",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
          }}
        >
          LossZero Agent
        </span>
      </div>

      <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 8 }}>
        {/* Thinking */}
        {thinkSegments.length > 0 && (
          <ThinkBlock
            content={thinkSegments.map((s) => s.content).join("\n\n")}
            closed={thinkSegments.every((s) => s.closed)}
            isStreaming={msg.isStreaming}
          />
        )}

        {/* Agent Trace */}
        {msg.traceEvents && msg.traceEvents.length > 0 && (
          <CollapsibleTrace events={msg.traceEvents} />
        )}

        {/* Answer bubble */}
        <div
          className="prose"
          style={{
            padding: "12px 16px",
            background: "var(--bg-elev-1)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "var(--r-lg)",
            color: "var(--text-strong)",
            fontSize: 14,
            lineHeight: 1.6,
          }}
        >
          {!hasVisibleText && msg.isStreaming ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                color: "var(--text-muted)",
                fontSize: 13,
              }}
            >
              <Dot tone="brand" pulse />
              <span>처리 중...</span>
            </div>
          ) : (
            <>
              {textSegments.map((seg, i) =>
                seg.content.trim() ? (
                  <ReactMarkdown key={i} remarkPlugins={[remarkGfm]}>
                    {seg.content}
                  </ReactMarkdown>
                ) : null,
              )}
              {msg.isStreaming && hasVisibleText && (
                <span className="caret-blink" />
              )}
            </>
          )}

          {/* Inline visualization */}
          {msg.data && msg.data.length > 0 && msg.vizHint && (
            <InlineViz data={msg.data} vizHint={msg.vizHint as VizHint} />
          )}
        </div>
      </div>
    </div>
  );
}

function getScrollParent(el: HTMLElement | null): HTMLElement | null {
  while (el && el !== document.body) {
    const { overflow, overflowY } = window.getComputedStyle(el);
    if (/auto|scroll/.test(overflow + overflowY)) return el;
    el = el.parentElement;
  }
  return document.documentElement as HTMLElement;
}

export default function MessageThread({ messages }: MessageThreadProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const userScrolledUp = useRef(false);

  useEffect(() => {
    const el = getScrollParent(containerRef.current);
    if (!el) return;
    const onScroll = () => {
      const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      userScrolledUp.current = distFromBottom > 80;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!userScrolledUp.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  if (!messages.length) return null;

  return (
    <div
      ref={containerRef}
      style={{ maxWidth: 820, margin: "0 auto", padding: "24px 20px" }}
    >
      {messages.map((msg) =>
        msg.role === "user" ? (
          <UserBubble key={msg.id} msg={msg} />
        ) : (
          <AssistantBubble key={msg.id} msg={msg} />
        ),
      )}
      <div ref={bottomRef} />
    </div>
  );
}
