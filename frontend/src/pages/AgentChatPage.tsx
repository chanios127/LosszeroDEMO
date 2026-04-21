import { useEffect, useRef, useState } from "react";
import { useAgentStream } from "../hooks/useAgentStream";
import { useConversationStore } from "../hooks/useConversationStore";
import ChatInput from "../components/ChatInput";
import MessageThread from "../components/MessageThread";
import ConversationList from "../components/ConversationList";

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
      className={`flex flex-col rounded-xl border border-slate-800 bg-gradient-to-br ${style.color}
        p-5 transition-all hover:border-slate-700 cursor-pointer group`}
      onClick={() => onSelect(domain)}
    >
      <div className="mb-3 text-3xl">{style.icon}</div>
      <h3 className="mb-1 font-semibold text-slate-100">{domain.display_name}</h3>
      <p className="mb-3 text-sm text-slate-400">
        {domain.table_count} tables{domain.sp_count > 0 && `, ${domain.sp_count} SPs`}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {domain.table_groups.map((g) => (
          <span key={g} className="rounded bg-slate-800/80 px-2 py-0.5 text-[10px] text-slate-500">
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
}: {
  domain: DomainInfo;
  onBack: () => void;
}) {
  const {
    messages,
    isStreaming,
    error,
    pendingContinue,
    send,
    cancel,
    reset,
    respondToContinue,
    loadMessages,
  } = useAgentStream();

  const {
    conversations,
    saveConversation,
    deleteConversation,
    renameConversation,
    downloadMarkdown,
  } = useConversationStore();

  const style = DOMAIN_STYLE[domain.domain] ?? DEFAULT_STYLE;
  const quickPrompts = domain.keywords.slice(0, 3).map((kw) => `${kw} 현황 조회`);

  const [currentConvId, setCurrentConvId] = useState<string>(() => crypto.randomUUID());
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Auto-save conversation on message change (only for current domain)
  const lastSavedLen = useRef(0);
  useEffect(() => {
    // Save only when messages actually change (not during streaming-in-progress updates to existing messages)
    if (messages.length === 0) return;
    if (messages.length === lastSavedLen.current && isStreaming) return;
    lastSavedLen.current = messages.length;
    saveConversation(currentConvId, domain.domain, domain.display_name, messages);
  }, [messages, isStreaming, currentConvId, domain.domain, domain.display_name, saveConversation]);

  const handleSelect = (id: string) => {
    const conv = conversations.find((c) => c.id === id);
    if (!conv) return;
    setCurrentConvId(id);
    lastSavedLen.current = conv.messages.length;
    loadMessages(conv.messages);
  };

  const handleNew = () => {
    const newId = crypto.randomUUID();
    setCurrentConvId(newId);
    lastSavedLen.current = 0;
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
        <div className="flex items-center gap-3 border-b border-slate-800 px-4 py-2 shrink-0">
          <button
            onClick={() => setSidebarOpen((v) => !v)}
            className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
            title={sidebarOpen ? "사이드바 접기" : "사이드바 펼치기"}
          >
            {sidebarOpen ? "◀" : "▶"}
          </button>
          <button
            onClick={onBack}
            className="rounded px-2 py-1 text-xs text-slate-400 hover:bg-slate-800 hover:text-slate-200"
          >
            ← 도메인 선택
          </button>
          <div className="h-4 w-px bg-slate-800" />
          <span className="text-sm">{style.icon}</span>
          <span className="text-sm font-medium text-slate-200">
            {domain.display_name}
          </span>
          <div className="ml-auto flex items-center gap-2">
            {isStreaming && (
              <button
                onClick={cancel}
                className="rounded bg-red-500/20 px-3 py-1 text-xs text-red-400 hover:bg-red-500/30"
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
                <h2 className="text-lg font-semibold text-slate-300">
                  {domain.display_name} 에이전트
                </h2>
                <p className="mt-1 mb-6 max-w-sm text-sm text-slate-500">
                  자연어로 질문하면 데이터를 조회하고 차트로 시각화합니다.
                </p>
                <div className="flex flex-col gap-2 w-full max-w-sm">
                  {quickPrompts.map((q) => (
                    <button
                      key={q}
                      onClick={() => send(q)}
                      className="rounded-lg border border-slate-700 px-4 py-2.5 text-sm text-left
                        text-slate-400 hover:border-brand-500 hover:text-brand-500 hover:bg-brand-500/5"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <MessageThread messages={messages} />

            {pendingContinue && (
              <div className="mt-4 rounded-lg border border-yellow-700/50 bg-yellow-900/20 p-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <p className="text-sm text-yellow-300">⏸️ {pendingContinue.message}</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => respondToContinue(pendingContinue.streamKey, true)}
                      className="rounded bg-green-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-green-500"
                    >
                      계속
                    </button>
                    <button
                      onClick={() => respondToContinue(pendingContinue.streamKey, false)}
                      className="rounded bg-slate-700 px-4 py-1.5 text-sm font-medium text-slate-300 hover:bg-slate-600"
                    >
                      중단
                    </button>
                  </div>
                </div>
              </div>
            )}

            {error && (
              <div className="mt-4 rounded-lg border border-red-800/50 bg-red-900/20 p-4 text-sm text-red-400">
                {error}
              </div>
            )}
          </div>
        </div>

        {/* Input */}
        <div className="mx-auto w-full max-w-3xl">
          <ChatInput onSend={send} disabled={isStreaming} />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AgentChatPage
// ---------------------------------------------------------------------------
export default function AgentChatPage() {
  const [domains, setDomains] = useState<DomainInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDomain, setSelectedDomain] = useState<DomainInfo | null>(null);

  useEffect(() => {
    fetch("/api/domains")
      .then((r) => r.json())
      .then((data) => { setDomains(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (selectedDomain) {
    return <AgentChat domain={selectedDomain} onBack={() => setSelectedDomain(null)} />;
  }

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-4xl px-6 py-10">
        <div className="mb-8">
          <h1 className="text-xl font-bold text-slate-100">에이전트 선택</h1>
          <p className="mt-1 text-sm text-slate-500">
            도메인을 선택하여 대화형 데이터 분석을 시작하세요.
          </p>
        </div>

        {loading ? (
          <p className="text-sm text-slate-500">로딩 중...</p>
        ) : domains.length === 0 ? (
          <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-8 text-center">
            <p className="text-sm text-slate-500">
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
