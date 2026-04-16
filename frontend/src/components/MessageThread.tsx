import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ChatMessage, VizHint } from "../types/events";
import { CollapsibleTrace } from "./AgentTrace";
import { InlineViz } from "./VizPanel";

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

  // Find all <think> open tags
  let openMatch: RegExpExecArray | null;
  thinkOpen.lastIndex = 0;

  while ((openMatch = thinkOpen.exec(raw)) !== null) {
    const openStart = openMatch.index;
    const contentStart = openStart + openMatch[0].length;

    // Text before this <think>
    if (openStart > cursor) {
      segments.push({ type: "text", content: raw.slice(cursor, openStart) });
    }

    // Find matching </think>
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
      // Unclosed <think> — still streaming
      segments.push({
        type: "think",
        content: raw.slice(contentStart),
        closed: false,
      });
      cursor = raw.length;
      break;
    }
  }

  // Remaining text after last </think>
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
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-800/50">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-xs text-slate-400 hover:text-slate-200 transition-colors"
      >
        <span className="text-slate-500">{open ? "▾" : "▸"}</span>
        <span className="font-medium">
          {closed ? "생각 과정" : "생각 중..."}
        </span>
        {!closed && isStreaming && (
          <span className="ml-1 h-2 w-2 animate-pulse rounded-full bg-brand-500" />
        )}
        <span className="ml-auto text-slate-600">{open ? "접기" : "펼치기"}</span>
      </button>
      {open && (
        <div className="border-t border-slate-700 px-3 py-2">
          <p className="whitespace-pre-wrap text-xs text-slate-400 leading-relaxed">
            {content}
          </p>
        </div>
      )}
    </div>
  );
}

function UserBubble({ msg }: { msg: ChatMessage }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[75%] rounded-2xl rounded-tr-sm bg-brand-500/20 px-4 py-3">
        <p className="whitespace-pre-wrap text-sm text-slate-200">
          {msg.content}
        </p>
      </div>
    </div>
  );
}

function AssistantBubble({ msg }: { msg: ChatMessage }) {
  const segments = parseContent(msg.content ?? "");
  const thinkSegments = segments.filter((s) => s.type === "think") as Extract<ContentSegment, { type: "think" }>[];
  const textSegments = segments.filter((s) => s.type === "text");
  const hasVisibleText = textSegments.some((s) => s.content.trim().length > 0);

  return (
    <div className="flex flex-col gap-2 items-start max-w-[85%]">
      {/* All think blocks merged into one toggle above the bubble */}
      {thinkSegments.length > 0 && (
        <ThinkBlock
          content={thinkSegments.map((s) => s.content).join("\n\n")}
          closed={thinkSegments.every((s) => s.closed)}
          isStreaming={msg.isStreaming}
        />
      )}

      {/* Message bubble */}
      <div className="w-full space-y-2 rounded-2xl rounded-tl-sm border border-slate-800 bg-slate-900/50 px-4 py-3">
        {/* Collapsible agent trace */}
        {msg.traceEvents && msg.traceEvents.length > 0 && (
          <CollapsibleTrace events={msg.traceEvents} />
        )}

        {/* Answer text */}
        {textSegments.map((seg, i) =>
          seg.content.trim() ? (
            <div key={i} className="prose prose-invert prose-sm max-w-none text-slate-200
              prose-headings:text-slate-100 prose-headings:font-semibold
              prose-p:leading-relaxed prose-p:my-1
              prose-table:text-sm prose-th:text-slate-300 prose-th:font-medium prose-td:text-slate-300
              prose-th:border prose-th:border-slate-600 prose-th:px-3 prose-th:py-1.5
              prose-td:border prose-td:border-slate-700 prose-td:px-3 prose-td:py-1.5
              prose-code:text-brand-400 prose-code:bg-slate-800 prose-code:px-1 prose-code:rounded
              prose-pre:bg-slate-800 prose-pre:border prose-pre:border-slate-700
              prose-strong:text-slate-100 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {seg.content}
              </ReactMarkdown>
              {msg.isStreaming && i === textSegments.length - 1 && (
                <span className="ml-1 inline-block h-4 w-1 animate-pulse bg-brand-500" />
              )}
            </div>
          ) : null,
        )}

        {/* Streaming cursor when no visible text yet */}
        {!hasVisibleText && msg.isStreaming && (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <span className="h-2 w-2 animate-pulse rounded-full bg-brand-500" />
            처리 중...
          </div>
        )}

        {/* Inline visualization */}
        {msg.data && msg.data.length > 0 && msg.vizHint && (
          <InlineViz data={msg.data} vizHint={msg.vizHint as VizHint} />
        )}
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

  // 실제 스크롤 컨테이너(main)에서 스크롤 감지
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
    <div ref={containerRef} className="space-y-4">
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
