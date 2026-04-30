import { useCallback, useEffect, useRef, useState } from "react";
import { useAgentStream } from "../hooks/useAgentStream";
import { useConversationStore } from "../hooks/useConversationStore";
import { useQuickPrompts } from "../hooks/useQuickPrompts";
import { useReportProposal } from "../hooks/useReportProposal";
import type { ChatMessage } from "../../design/types/chat";
import type { ViewBundle } from "../../design/types/view";
import ChatInput from "../../design/components/ChatInput";
import MessageThread from "../../design/components/MessageThread";
import ConversationList from "../../design/components/ConversationList";
import { ReportContainer } from "../../design/components/report/ReportContainer";
import {
  ReportProposalCard,
  type ReportProposal,
} from "../../design/components/report/ReportProposalCard";

// Phase 9.5 — split message thread around assistant messages that carry a
// build_view bundle so a ReportContainer renders inline right below the bubble.
type MessageChunk =
  | { kind: "thread"; key: string; messages: ChatMessage[] }
  | { kind: "report"; key: string; viewBundle: ViewBundle };

function splitMessagesForReports(
  messages: ChatMessage[],
): MessageChunk[] {
  const chunks: MessageChunk[] = [];
  let buffer: ChatMessage[] = [];
  for (const m of messages) {
    buffer.push(m);
    if (m.role === "assistant" && m.viewBundle) {
      chunks.push({
        kind: "thread",
        key: `thread-${m.id}`,
        messages: [...buffer],
      });
      chunks.push({
        kind: "report",
        key: `report-${m.id}`,
        viewBundle: m.viewBundle,
      });
      buffer = [];
    }
  }
  if (buffer.length > 0) {
    chunks.push({ kind: "thread", key: "thread-tail", messages: buffer });
  }
  return chunks;
}

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------
interface DomainInfo {
  domain: string;
  display_name: string;
  db: string;
  table_count: number;
  sp_count: number;
  table_groups: string[];
  keywords: string[];
}

const DOMAIN_STYLE: Record<string, { icon: string; color: string }> = {
  groupware:  { icon: "📋", color: "from-brand-500/20 to-cyan-500/10" },
  production: { icon: "⚙️", color: "from-emerald-500/20 to-teal-500/10" },
  inventory:  { icon: "📦", color: "from-violet-500/20 to-purple-500/10" },
  quality:    { icon: "✅", color: "from-amber-500/20 to-orange-500/10" },
};
const DEFAULT_STYLE = { icon: "🔍", color: "from-slate-500/20 to-slate-500/10" };

// ---------------------------------------------------------------------------
// DomainSelector — initial screen
// ---------------------------------------------------------------------------
function DomainCard({
  domain,
  onSelect,
}: {
  domain: DomainInfo;
  onSelect: (d: DomainInfo) => void;
}) {
  const style = DOMAIN_STYLE[domain.domain] ?? DEFAULT_STYLE;
  return (
    <div
      className={`flex flex-col rounded-xl border border-border-subtle bg-gradient-to-br ${style.color}
        p-5 transition-all hover:border-border cursor-pointer group`}
      onClick={() => onSelect(domain)}
    >
      <div className="mb-3 text-3xl">{style.icon}</div>
      <h3 className="mb-1 font-semibold text-text-strong">{domain.display_name}</h3>
      <p className="mb-3 text-sm text-text-muted">
        {domain.table_count} tables{domain.sp_count > 0 && `, ${domain.sp_count} SPs`}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {domain.table_groups.map((g) => (
          <span key={g} className="rounded bg-bg-elev-2 px-2 py-0.5 text-[10px] text-text-dim">
            {g}
          </span>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AgentChat — main chat view with conversation sidebar
// ---------------------------------------------------------------------------
function AgentChat({
  domain,
  onBack,
  pendingQuery,
  onClearPendingQuery,
}: {
  domain: DomainInfo;
  onBack: () => void;
  pendingQuery?: string | null;
  onClearPendingQuery?: () => void;
}) {
  const {
    messages,
    sessionId,
    streamKey,
    isStreaming,
    error,
    pendingContinue,
    send,
    cancel,
    reset,
    respondToContinue,
    loadMessages,
  } = useAgentStream();

  const [archiveToast, setArchiveToast] = useState<string | null>(null);

  const showArchiveToast = useCallback((msg: string) => {
    setArchiveToast(msg);
    setTimeout(() => setArchiveToast(null), 3000);
  }, []);

  const { proposal, pending: proposalPending, archive, discard } =
    useReportProposal({
      streamKey,
      onArchived: () => showArchiveToast("📥 보고서가 보관함에 저장되었습니다."),
    });

  const proposalCardData: ReportProposal | null = proposal
    ? {
        idTemp: proposal.id_temp,
        title: proposal.schema.title,
        summary: proposal.summary,
        meta: {
          blocks: proposal.meta.blocks,
          dataRefs: proposal.meta.dataRefs,
          domain: proposal.meta.domain,
          schemaVersion: proposal.meta.schemaVersion,
        },
        tags: [],
      }
    : null;

  const {
    conversations,
    saveConversation,
    deleteConversation,
    renameConversation,
    downloadMarkdown,
  } = useConversationStore();

  const style = DOMAIN_STYLE[domain.domain] ?? DEFAULT_STYLE;
  const { prompts: quickPrompts } = useQuickPrompts(
    domain.domain,
    domain.keywords,
  );

  const [currentConvId, setCurrentConvId] = useState<string>(() => crypto.randomUUID());
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Consume pendingQuery from Dashboard QuickAsk
  // Use ref to guard against React StrictMode double-mount re-firing
  const consumedPendingRef = useRef<string | null>(null);
  useEffect(() => {
    const q = pendingQuery?.trim();
    if (q && consumedPendingRef.current !== q && !isStreaming) {
      consumedPendingRef.current = q;
      send(q);
      onClearPendingQuery?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingQuery]);

  // Auto-save conversation on message/session/stream change.
  // We persist sessionId/streamKey alongside messages so a mid-stream navigation
  // away can be resumed on return. The skip-during-streaming optimization only
  // skips on pure delta updates (messages reference changes but length, sessionId,
  // and streamKey all stay the same). Otherwise APPEND_DELTA would write the
  // localStorage on every chunk — too noisy.
  const lastSavedLen = useRef(0);
  const lastSavedSessionId = useRef<string | null>(null);
  const lastSavedStreamKey = useRef<string | null>(null);
  useEffect(() => {
    if (messages.length === 0) return;

    const lengthChanged = messages.length !== lastSavedLen.current;
    const sessionChanged = (sessionId ?? null) !== lastSavedSessionId.current;
    const streamChanged = (streamKey ?? null) !== lastSavedStreamKey.current;

    // Skip ONLY when streaming AND nothing structural changed (i.e. pure delta).
    // When sessionId/streamKey first arrive (after fetch returns) we MUST save
    // even mid-stream so a return-visit can reconnect via streamKey.
    if (isStreaming && !lengthChanged && !sessionChanged && !streamChanged) {
      return;
    }

    lastSavedLen.current = messages.length;
    lastSavedSessionId.current = sessionId ?? null;
    lastSavedStreamKey.current = streamKey ?? null;
    saveConversation(
      currentConvId,
      domain.domain,
      domain.display_name,
      messages,
      sessionId ?? undefined,
      streamKey ?? undefined,
    );
  }, [
    messages,
    isStreaming,
    sessionId,
    streamKey,
    currentConvId,
    domain.domain,
    domain.display_name,
    saveConversation,
  ]);

  const handleSelect = (id: string) => {
    const conv = conversations.find((c) => c.id === id);
    if (!conv) return;
    setCurrentConvId(id);
    // Sync save-tracking refs to the loaded conversation so the post-load
    // autosave doesn't immediately re-write identical state.
    lastSavedLen.current = conv.messages.length;
    lastSavedSessionId.current = conv.sessionId ?? null;
    lastSavedStreamKey.current = conv.streamKey ?? null;
    // Pass stored sessionId/streamKey so loadMessages can reconnect SSE
    // if the conversation was mid-stream when we left.
    loadMessages(
      conv.messages,
      conv.sessionId ?? null,
      conv.streamKey ?? null,
    );
  };

  const handleNew = () => {
    const newId = crypto.randomUUID();
    setCurrentConvId(newId);
    lastSavedLen.current = 0;
    lastSavedSessionId.current = null;
    lastSavedStreamKey.current = null;
    reset();
  };

  const handleDelete = (id: string) => {
    deleteConversation(id);
    if (id === currentConvId) handleNew();
  };

  // Filter conversations to current domain only
  const domainConversations = conversations.filter(
    (c) => c.domain === domain.domain,
  );

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left: Conversation list */}
      <div
        className={`shrink-0 transition-all duration-200 ${
          sidebarOpen ? "w-64" : "w-0"
        } overflow-hidden`}
      >
        <ConversationList
          conversations={domainConversations}
          currentId={currentConvId}
          streamingId={isStreaming ? currentConvId : null}
          onSelect={handleSelect}
          onNew={handleNew}
          onDelete={handleDelete}
          onRename={renameConversation}
          onDownload={downloadMarkdown}
        />
      </div>

      {/* Right: Chat area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-border-subtle px-4 py-2 shrink-0">
          <button
            onClick={() => setSidebarOpen((v) => !v)}
            className="rounded p-1 text-text-muted hover:bg-bg-elev-2 hover:text-text-strong"
            title={sidebarOpen ? "사이드바 접기" : "사이드바 펼치기"}
          >
            {sidebarOpen ? "◀" : "▶"}
          </button>
          <button
            onClick={onBack}
            className="rounded px-2 py-1 text-xs text-text-muted hover:bg-bg-elev-2 hover:text-text-strong"
          >
            ← 도메인 선택
          </button>
          <div className="h-4 w-px bg-bg-elev-2" />
          <span className="text-sm">{style.icon}</span>
          <span className="text-sm font-medium text-text-strong">
            {domain.display_name}
          </span>
          <div className="ml-auto flex items-center gap-2">
            {isStreaming && (
              <button
                onClick={cancel}
                className="rounded bg-[color:color-mix(in_oklch,var(--danger)_20%,transparent)] px-3 py-1 text-xs text-danger hover:bg-[color:color-mix(in_oklch,var(--danger)_30%,transparent)]"
              >
                취소
              </button>
            )}
          </div>
        </div>

        {/* Chat area */}
        <div className="flex-1 overflow-auto p-4 lg:p-6">
          <div className="mx-auto max-w-3xl">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="text-4xl mb-3">{style.icon}</div>
                <h2 className="text-lg font-semibold text-text-base">
                  {domain.display_name} 에이전트
                </h2>
                <p className="mt-1 mb-6 max-w-sm text-sm text-text-dim">
                  자연어로 질문하면 데이터를 조회하고 차트로 시각화합니다.
                </p>
                <div className="flex flex-col gap-2 w-full max-w-sm">
                  {quickPrompts.map((q) => (
                    <button
                      key={q.id}
                      onClick={() => send(q.prompt)}
                      title={q.prompt}
                      className="rounded-lg border border-border px-4 py-2.5 text-sm text-left
                        text-text-muted hover:border-brand-500 hover:text-brand-500 hover:bg-[color:color-mix(in_oklch,var(--brand-500)_5%,transparent)]"
                    >
                      {q.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {splitMessagesForReports(messages).map((c) =>
              c.kind === "thread" ? (
                <MessageThread key={c.key} messages={c.messages} />
              ) : (
                <ReportContainer
                  key={c.key}
                  schema={c.viewBundle.schema}
                  blockSpecs={c.viewBundle.blocks}
                />
              ),
            )}

            {pendingContinue && (
              <div className="mt-4 rounded-lg border border-yellow-700/50 bg-yellow-900/20 p-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <p className="text-sm text-yellow-300">⏸️ {pendingContinue.message}</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => respondToContinue(pendingContinue.streamKey, true)}
                      className="rounded bg-success px-4 py-1.5 text-sm font-medium text-white hover:bg-success"
                    >
                      계속
                    </button>
                    <button
                      onClick={() => respondToContinue(pendingContinue.streamKey, false)}
                      className="rounded bg-bg-elev-3 px-4 py-1.5 text-sm font-medium text-text-base hover:bg-bg-elev-3"
                    >
                      중단
                    </button>
                  </div>
                </div>
              </div>
            )}

            {error && (
              <div className="mt-4 rounded-lg border border-[color:color-mix(in_oklch,var(--danger)_30%,transparent)] bg-[color:color-mix(in_oklch,var(--danger)_15%,transparent)] p-4 text-sm text-danger">
                {error}
              </div>
            )}
          </div>
        </div>

        {/* HITL: ReportProposalCard sticky bar above composer */}
        {proposalCardData && (
          <div
            style={{
              borderTop: "1px solid var(--border-subtle)",
              background: "var(--bg)",
              padding: "10px 16px",
              flexShrink: 0,
            }}
          >
            <div className="mx-auto" style={{ maxWidth: 720 }}>
              <ReportProposalCard
                proposal={proposalCardData}
                onArchive={(_idTemp, edits) => archive(edits)}
                onDiscard={() => discard()}
                disabled={proposalPending}
              />
            </div>
          </div>
        )}

        {/* Archive success toast */}
        {archiveToast && (
          <div
            style={{
              position: "fixed",
              bottom: 80,
              left: "50%",
              transform: "translateX(-50%)",
              background: "var(--bg-elev-3)",
              border: "1px solid var(--border)",
              borderRadius: "var(--r-md)",
              padding: "8px 16px",
              fontSize: 13,
              color: "var(--text-strong)",
              zIndex: 50,
              pointerEvents: "none",
              boxShadow: "var(--shadow-md)",
            }}
          >
            {archiveToast}
          </div>
        )}

        {/* Input */}
        <div className="mx-auto w-full max-w-3xl">
          <ChatInput
            onSend={send}
            onStop={cancel}
            disabled={isStreaming}
            domainLabel={domain.display_name}
          />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AgentChatPage
// ---------------------------------------------------------------------------
interface AgentChatPageProps {
  pendingQuery?: string | null;
  onClearPendingQuery?: () => void;
}

export default function AgentChatPage({
  pendingQuery,
  onClearPendingQuery,
}: AgentChatPageProps = {}) {
  const [domains, setDomains] = useState<DomainInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDomain, setSelectedDomain] = useState<DomainInfo | null>(null);

  useEffect(() => {
    fetch("/api/domains")
      .then((r) => r.json())
      .then((data) => { setDomains(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  // Auto-select sole domain when pendingQuery arrives (QuickAsk flow)
  useEffect(() => {
    if (
      pendingQuery &&
      pendingQuery.trim() &&
      !selectedDomain &&
      domains.length >= 1
    ) {
      setSelectedDomain(domains[0]);
    }
  }, [pendingQuery, domains, selectedDomain]);

  if (selectedDomain) {
    return (
      <AgentChat
        domain={selectedDomain}
        onBack={() => setSelectedDomain(null)}
        pendingQuery={pendingQuery}
        onClearPendingQuery={onClearPendingQuery}
      />
    );
  }

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-4xl px-6 py-10">
        <div className="mb-8">
          <h1 className="text-xl font-bold text-text-strong">에이전트 선택</h1>
          <p className="mt-1 text-sm text-text-dim">
            도메인을 선택하여 대화형 데이터 분석을 시작하세요.
          </p>
        </div>

        {loading ? (
          <p className="text-sm text-text-dim">로딩 중...</p>
        ) : domains.length === 0 ? (
          <div className="rounded-lg border border-border-subtle bg-bg-elev-1 p-8 text-center">
            <p className="text-sm text-text-dim">
              등록된 도메인이 없습니다. schema_registry/domains/ 에 JSON을 추가하세요.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {domains.map((d) => (
              <DomainCard key={d.domain} domain={d} onSelect={setSelectedDomain} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
