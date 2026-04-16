import { useEffect, useState } from "react";
import { useAgentStream } from "../hooks/useAgentStream";
import ChatInput from "../components/ChatInput";
import MessageThread from "../components/MessageThread";
import ResultsBoard from "../components/ResultsBoard";

// ---------------------------------------------------------------------------
// Domain types (from GET /api/domains)
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

// Map domain to visual presentation
const DOMAIN_STYLE: Record<string, { icon: string; color: string }> = {
  groupware:  { icon: "📋", color: "from-brand-500/20 to-cyan-500/10" },
  production: { icon: "⚙️", color: "from-emerald-500/20 to-teal-500/10" },
  inventory:  { icon: "📦", color: "from-violet-500/20 to-purple-500/10" },
  quality:    { icon: "✅", color: "from-amber-500/20 to-orange-500/10" },
};

const DEFAULT_STYLE = { icon: "🔍", color: "from-slate-500/20 to-slate-500/10" };

// ---------------------------------------------------------------------------
// DomainCard
// ---------------------------------------------------------------------------
function DomainCard({
  domain,
  onSelect,
}: {
  domain: DomainInfo;
  onSelect: (domain: DomainInfo) => void;
}) {
  const style = DOMAIN_STYLE[domain.domain] ?? DEFAULT_STYLE;

  return (
    <div
      className={`relative flex flex-col rounded-xl border border-slate-800
        bg-gradient-to-br ${style.color} p-5 transition-all
        hover:border-slate-700 cursor-pointer group`}
      onClick={() => onSelect(domain)}
    >
      <div className="mb-3 text-3xl">{style.icon}</div>
      <h3 className="mb-1.5 font-semibold text-slate-100">
        {domain.display_name} 에이전트
      </h3>
      <p className="mb-4 flex-1 text-sm text-slate-400 leading-relaxed">
        {domain.table_count}개 테이블, {domain.sp_count}개 SP
        {domain.db && ` (${domain.db})`}
      </p>

      <div className="mb-4 flex flex-wrap gap-1.5">
        {domain.table_groups.map((group) => (
          <span
            key={group}
            className="rounded bg-slate-800/80 px-2 py-0.5 text-[10px] text-slate-500"
          >
            {group}
          </span>
        ))}
      </div>

      <button
        className="w-full rounded-lg bg-slate-800 py-2 text-sm font-medium
          text-slate-300 transition group-hover:bg-slate-700 group-hover:text-slate-100"
      >
        대화 시작 →
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AgentChat — chat interface for a selected domain
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
    results,
    activeResultId,
    send,
    cancel,
    reset,
    respondToContinue,
    setActiveResult,
  } = useAgentStream();

  const [mobileTab, setMobileTab] = useState<"chat" | "results">("chat");
  const style = DOMAIN_STYLE[domain.domain] ?? DEFAULT_STYLE;

  // Build quick prompts from keywords
  const quickPrompts = domain.keywords
    .slice(0, 3)
    .map((kw) => `${kw} 현황 조회`);

  const chatContent = (
    <>
      {messages.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="text-4xl mb-3">{style.icon}</div>
          <h2 className="text-lg font-semibold text-slate-300">
            {domain.display_name} 에이전트
          </h2>
          <p className="mt-1 mb-6 max-w-sm text-sm text-slate-500">
            {domain.table_count}개 테이블에서 {domain.display_name} 관련 데이터를
            조회하고 분석합니다.
          </p>
          <div className="flex flex-col gap-2 w-full max-w-sm">
            {quickPrompts.map((q) => (
              <button
                key={q}
                onClick={() => send(q)}
                className="rounded-lg border border-slate-700 px-4 py-2.5 text-sm text-left
                  text-slate-400 transition hover:border-brand-500 hover:text-brand-500 hover:bg-brand-500/5"
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
            <p className="text-sm text-yellow-300">
              ⏸️ {pendingContinue.message}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() =>
                  respondToContinue(pendingContinue.streamKey, true)
                }
                className="rounded bg-green-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-green-500"
              >
                계속
              </button>
              <button
                onClick={() =>
                  respondToContinue(pendingContinue.streamKey, false)
                }
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
    </>
  );

  const mobileTabs = (
    <div className="flex lg:hidden border-b border-slate-800 shrink-0">
      {(["chat", "results"] as const).map((tab) => (
        <button
          key={tab}
          onClick={() => setMobileTab(tab)}
          className={`flex-1 py-2 text-sm border-b-2 transition-colors ${
            mobileTab === tab
              ? "border-brand-500 text-brand-500"
              : "border-transparent text-slate-400"
          }`}
        >
          {tab === "chat"
            ? "채팅"
            : `결과${results.length > 0 ? ` (${results.length})` : ""}`}
        </button>
      ))}
    </div>
  );

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Agent header bar */}
      <div className="flex items-center gap-3 border-b border-slate-800 px-4 py-2 shrink-0">
        <button
          onClick={onBack}
          className="flex items-center gap-1 rounded px-2 py-1 text-xs text-slate-400
            hover:bg-slate-800 hover:text-slate-200 transition-colors"
        >
          ← 목록
        </button>
        <div className="h-4 w-px bg-slate-800" />
        <span className="text-sm">{style.icon}</span>
        <span className="text-sm font-medium text-slate-200">
          {domain.display_name} 에이전트
        </span>
        <div className="ml-auto flex items-center gap-2">
          {messages.length > 0 && (
            <button
              onClick={reset}
              className="rounded bg-slate-800 px-3 py-1 text-xs text-slate-400
                hover:bg-slate-700 hover:text-slate-200"
            >
              새 대화
            </button>
          )}
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

      {/* Split layout */}
      <div className="flex flex-1 overflow-hidden">
        <div
          className={`flex flex-col w-full lg:w-[45%] lg:border-r lg:border-slate-800 overflow-hidden ${
            mobileTab === "results" ? "hidden lg:flex" : "flex"
          }`}
        >
          {mobileTabs}
          <div className="flex-1 overflow-auto p-4 lg:p-6">{chatContent}</div>
          <ChatInput onSend={send} disabled={isStreaming} />
        </div>

        <div
          className={`flex-col flex-1 overflow-hidden ${
            mobileTab === "chat" ? "hidden lg:flex" : "flex"
          }`}
        >
          {mobileTabs}
          <div className="flex-1 overflow-hidden">
            <ResultsBoard
              results={results}
              activeResultId={activeResultId}
              onSelectResult={setActiveResult}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AgentChatPage — domain selection + chat
// ---------------------------------------------------------------------------
export default function AgentChatPage() {
  const [domains, setDomains] = useState<DomainInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDomain, setSelectedDomain] = useState<DomainInfo | null>(null);

  useEffect(() => {
    fetch("/api/domains")
      .then((r) => r.json())
      .then((data) => {
        setDomains(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (selectedDomain) {
    return (
      <AgentChat
        domain={selectedDomain}
        onBack={() => setSelectedDomain(null)}
      />
    );
  }

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-4xl px-6 py-10">
        <div className="mb-8">
          <h1 className="text-xl font-bold text-slate-100">에이전트 선택</h1>
          <p className="mt-1 text-sm text-slate-500">
            등록된 도메인의 전문 에이전트를 선택하여 대화를 시작하세요.
          </p>
        </div>

        {loading ? (
          <div className="text-sm text-slate-500">도메인 로드 중...</div>
        ) : domains.length === 0 ? (
          <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-8 text-center">
            <p className="text-sm text-slate-500">
              등록된 도메인이 없습니다. backend/schema_registry/domains/ 에 도메인
              JSON을 추가하세요.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {domains.map((d) => (
              <DomainCard
                key={d.domain}
                domain={d}
                onSelect={setSelectedDomain}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
