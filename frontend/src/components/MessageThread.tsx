import { useEffect, useRef } from "react";
import type { ChatMessage, VizHint } from "../types/events";
import { CollapsibleTrace } from "./AgentTrace";
import { InlineViz } from "./VizPanel";

interface MessageThreadProps {
  messages: ChatMessage[];
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
  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] space-y-1 rounded-2xl rounded-tl-sm border border-slate-800 bg-slate-900/50 px-4 py-3">
        {/* Collapsible agent trace */}
        {msg.traceEvents && msg.traceEvents.length > 0 && (
          <CollapsibleTrace events={msg.traceEvents} />
        )}

        {/* Answer text */}
        {msg.content && (
          <p className="whitespace-pre-wrap text-sm text-slate-200">
            {msg.content}
            {msg.isStreaming && (
              <span className="ml-1 inline-block h-4 w-1 animate-pulse bg-brand-500" />
            )}
          </p>
        )}

        {/* Empty streaming state */}
        {!msg.content && msg.isStreaming && (
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

export default function MessageThread({ messages }: MessageThreadProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (!messages.length) return null;

  return (
    <div className="space-y-4">
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
