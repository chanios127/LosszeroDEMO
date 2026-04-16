import { useEffect, useState } from "react";
import { useAgentStream } from "../hooks/useAgentStream";
import ChatInput from "../components/ChatInput";
import MessageThread from "../components/MessageThread";
import ResultsBoard from "../components/ResultsBoard";

export default function DataQueryPage() {
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

  // Switch to results tab when new result arrives on mobile
  useEffect(() => {
    if (results.length > 0) setMobileTab("results");
  }, [results.length]);

  const chatContent = (
    <>
      {messages.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="text-4xl">🔍</div>
          <h2 className="mt-4 text-xl font-semibold text-slate-300">
            ERP 데이터를 자연어로 조회하세요
          </h2>
          <p className="mt-2 max-w-md text-sm text-slate-500">
            생산 실적, 재고 현황, 작업 지시 등 MSSQL에 저장된 데이터를
            자연어로 검색하고 시각화합니다.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            {["오늘 공정별 생산량 조회", "현재 재고 현황 알려줘", "작업 지시 목록 보여줘"].map((q) => (
              <button
                key={q}
                onClick={() => send(q)}
                className="rounded-full border border-slate-700 px-4 py-2 text-sm
                  text-slate-400 transition hover:border-brand-500 hover:text-brand-500"
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
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-slate-800 px-4 py-2 shrink-0">
        <span className="text-xs text-slate-500">
          {isStreaming ? "처리 중..." : messages.length > 0 ? `${results.length}개 결과` : "쿼리를 입력하세요"}
        </span>
        <div className="flex items-center gap-2">
          {messages.length > 0 && (
            <button
              onClick={reset}
              className="rounded bg-slate-800 px-3 py-1 text-xs text-slate-400 hover:bg-slate-700 hover:text-slate-200"
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
