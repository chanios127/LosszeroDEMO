import { useState } from "react";
import { useAgentStream } from "../hooks/useAgentStream";
import ChatInput from "../components/ChatInput";
import MessageThread from "../components/MessageThread";
import ResultsBoard from "../components/ResultsBoard";

// ---------------------------------------------------------------------------
// Agent definitions
// ---------------------------------------------------------------------------
interface AgentDef {
  id: string;
  name: string;
  description: string;
  tags: string[];
  icon: string;
  color: string;
  status: "active" | "soon";
  quickPrompts: string[];
}

const AGENTS: AgentDef[] = [
  {
    id: "production",
    name: "생산 분석 에이전트",
    description: "공정별 생산 실적, 불량률, 작업 지시 현황을 분석합니다.",
    tags: ["생산 실적", "불량 분석", "공정 모니터링"],
    icon: "⚙️",
    color: "from-brand-500/20 to-cyan-500/10",
    status: "active",
    quickPrompts: [
      "오늘 공정별 생산량 알려줘",
      "이번 주 불량률 추이 보여줘",
      "현재 진행 중인 작업 지시 목록",
    ],
  },
  {
    id: "inventory",
    name: "재고 관리 에이전트",
    description: "자재 재고 현황, 입출고 이력, 재고 회전율을 분석합니다.",
    tags: ["재고 현황", "입출고", "안전재고"],
    icon: "📦",
    color: "from-emerald-500/20 to-teal-500/10",
    status: "active",
    quickPrompts: [
      "현재 재고 부족 자재 알려줘",
      "오늘 입고 예정 자재 목록",
      "재고 회전율 낮은 품목 상위 10개",
    ],
  },
  {
    id: "quality",
    name: "품질 관리 에이전트",
    description: "검사 결과, 품질 지표, 불량 원인을 분석하고 개선 방향을 제시합니다.",
    tags: ["검사 결과", "품질 지표", "불량 원인"],
    icon: "✅",
    color: "from-violet-500/20 to-purple-500/10",
    status: "soon",
    quickPrompts: [],
  },
  {
    id: "equipment",
    name: "설비 관리 에이전트",
    description: "설비 가동률, 고장 이력, 예방 정비 일정을 관리합니다.",
    tags: ["가동률", "고장 이력", "예방 정비"],
    icon: "🔧",
    color: "from-amber-500/20 to-orange-500/10",
    status: "soon",
    quickPrompts: [],
  },
];

// ---------------------------------------------------------------------------
// AgentCard
// ---------------------------------------------------------------------------
function AgentCard({
  agent,
  onSelect,
}: {
  agent: AgentDef;
  onSelect: (agent: AgentDef) => void;
}) {
  return (
    <div
      className={`relative flex flex-col rounded-xl border border-slate-800
        bg-gradient-to-br ${agent.color} p-5 transition-all
        ${agent.status === "active"
          ? "hover:border-slate-700 cursor-pointer group"
          : "opacity-55 cursor-default"
        }`}
      onClick={agent.status === "active" ? () => onSelect(agent) : undefined}
    >
      {agent.status === "soon" && (
        <span className="absolute right-3 top-3 rounded bg-slate-800 px-2 py-0.5 text-[10px] font-medium text-slate-400">
          준비 중
        </span>
      )}

      <div className="mb-3 text-3xl">{agent.icon}</div>
      <h3 className="mb-1.5 font-semibold text-slate-100">{agent.name}</h3>
      <p className="mb-4 flex-1 text-sm text-slate-400 leading-relaxed">
        {agent.description}
      </p>

      <div className="mb-4 flex flex-wrap gap-1.5">
        {agent.tags.map((tag) => (
          <span
            key={tag}
            className="rounded bg-slate-800/80 px-2 py-0.5 text-[10px] text-slate-500"
          >
            {tag}
          </span>
        ))}
      </div>

      {agent.status === "active" && (
        <button
          onClick={() => onSelect(agent)}
          className="w-full rounded-lg bg-slate-800 py-2 text-sm font-medium
            text-slate-300 transition group-hover:bg-slate-700 group-hover:text-slate-100"
        >
          대화 시작 →
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// AgentChat — chat interface for a selected agent
// ---------------------------------------------------------------------------
function AgentChat({
  agent,
  onBack,
}: {
  agent: AgentDef;
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

  const chatContent = (
    <>
      {messages.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="text-4xl mb-3">{agent.icon}</div>
          <h2 className="text-lg font-semibold text-slate-300">{agent.name}</h2>
          <p className="mt-1 mb-6 max-w-sm text-sm text-slate-500">
            {agent.description}
          </p>
          <div className="flex flex-col gap-2 w-full max-w-sm">
            {agent.quickPrompts.map((q) => (
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
          {tab === "chat" ? "채팅" : `결과${results.length > 0 ? ` (${results.length})` : ""}`}
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
        <span className="text-sm">{agent.icon}</span>
        <span className="text-sm font-medium text-slate-200">{agent.name}</span>
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
        {/* Left: Chat */}
        <div
          className={`flex flex-col w-full lg:w-[45%] lg:border-r lg:border-slate-800 overflow-hidden ${
            mobileTab === "results" ? "hidden lg:flex" : "flex"
          }`}
        >
          {mobileTabs}
          <div className="flex-1 overflow-auto p-4 lg:p-6">{chatContent}</div>
          <ChatInput onSend={send} disabled={isStreaming} />
        </div>

        {/* Right: Results */}
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
// AgentChatPage
// ---------------------------------------------------------------------------
export default function AgentChatPage() {
  const [selectedAgent, setSelectedAgent] = useState<AgentDef | null>(null);

  if (selectedAgent) {
    return (
      <AgentChat
        agent={selectedAgent}
        onBack={() => setSelectedAgent(null)}
      />
    );
  }

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-4xl px-6 py-10">
        <div className="mb-8">
          <h1 className="text-xl font-bold text-slate-100">에이전트 선택</h1>
          <p className="mt-1 text-sm text-slate-500">
            분석 목적에 맞는 전문 에이전트를 선택하여 대화를 시작하세요.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {AGENTS.map((agent) => (
            <AgentCard key={agent.id} agent={agent} onSelect={setSelectedAgent} />
          ))}
        </div>
      </div>
    </div>
  );
}
