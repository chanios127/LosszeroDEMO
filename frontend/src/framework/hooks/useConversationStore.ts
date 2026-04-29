import { useCallback, useEffect, useState } from "react";
import type { ChatMessage, Conversation } from "../../design/types/chat";

export type { Conversation };

const STORAGE_KEY = "llm-harness-conversations";

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function loadFromStorage(): Conversation[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    // Conversation extra fields (reportSchema/viewBundle on messages)
    // are plain JSON, so JSON.parse round-trips them automatically. Older
    // entries without these fields just have undefined, which is fine.
    return JSON.parse(raw) as Conversation[];
  } catch {
    return [];
  }
}

function saveToStorage(conversations: Conversation[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
  } catch {
    // storage full or disabled
  }
}

function generateTitle(messages: ChatMessage[]): string {
  const firstUser = messages.find((m) => m.role === "user");
  if (!firstUser) return "새 대화";
  return firstUser.content.slice(0, 40).trim() || "새 대화";
}

function exportToMarkdown(conv: Conversation): string {
  const lines: string[] = [
    `# ${conv.title}`,
    `- Domain: ${conv.domainLabel}`,
    `- Created: ${new Date(conv.createdAt).toLocaleString()}`,
    "",
    "---",
    "",
  ];

  for (const msg of conv.messages) {
    if (msg.role === "user") {
      lines.push(`### 👤 User`);
      lines.push(msg.content);
    } else {
      lines.push(`### 🤖 Assistant`);
      // Strip <think> blocks for clean output
      const cleaned = msg.content.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
      lines.push(cleaned);
      if (msg.data && msg.data.length > 0) {
        lines.push("");
        lines.push(`_데이터: ${msg.data.length}행 (${msg.vizHint})_`);
      }
    }
    lines.push("");
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useConversationStore() {
  const [conversations, setConversations] = useState<Conversation[]>(
    () => loadFromStorage(),
  );

  useEffect(() => {
    saveToStorage(conversations);
  }, [conversations]);

  const saveConversation = useCallback(
    (
      id: string,
      domain: string,
      domainLabel: string,
      messages: ChatMessage[],
      sessionId?: string,
      streamKey?: string,
    ) => {
      if (messages.length === 0) return;
      setConversations((prev) => {
        const existing = prev.find((c) => c.id === id);
        const title = existing?.title ?? generateTitle(messages);
        const now = Date.now();
        // Preserve previously stored sessionId/streamKey if the current call
        // didn't provide them (e.g. autosave fires before backend assigns them).
        const updated: Conversation = existing
          ? {
              ...existing,
              messages,
              sessionId: sessionId ?? existing.sessionId,
              streamKey: streamKey ?? existing.streamKey,
              updatedAt: now,
            }
          : {
              id,
              title,
              domain,
              domainLabel,
              messages,
              sessionId,
              streamKey,
              createdAt: now,
              updatedAt: now,
            };

        const others = prev.filter((c) => c.id !== id);
        // newest first
        return [updated, ...others].sort(
          (a, b) => b.updatedAt - a.updatedAt,
        );
      });
    },
    [],
  );

  const deleteConversation = useCallback((id: string) => {
    setConversations((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const renameConversation = useCallback((id: string, title: string) => {
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, title } : c)),
    );
  }, []);

  const clearAll = useCallback(() => {
    setConversations([]);
  }, []);

  const downloadMarkdown = useCallback((id: string) => {
    const conv = conversations.find((c) => c.id === id);
    if (!conv) return;
    const md = exportToMarkdown(conv);
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${conv.title.replace(/[^\w가-힣-]/g, "_")}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, [conversations]);

  return {
    conversations,
    saveConversation,
    deleteConversation,
    renameConversation,
    clearAll,
    downloadMarkdown,
  };
}
