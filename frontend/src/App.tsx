import { useAgentStream } from "./hooks/useAgentStream";
import ApprovalPrompt from "./components/ApprovalPrompt";
import ChatInput from "./components/ChatInput";
import MessageThread from "./components/MessageThread";

export default function App() {
  const {
    messages,
    isStreaming,
    error,
    pendingApproval,
    send,
    cancel,
    reset,
    respondToApproval,
  } = useAgentStream();

  return (
    <div className="flex h-screen flex-col">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-slate-800 px-6 py-3">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold text-slate-100">LLM Harness</h1>
          <span className="rounded bg-brand-500/20 px-2 py-0.5 text-xs font-medium text-brand-500">
            PoC
          </span>
        </div>
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
              Cancel
            </button>
          )}
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-4xl">
          {/* Welcome message */}
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
                {[
                  "오늘 공정별 생산량 조회",
                  "현재 재고 현황 알려줘",
                  "작업 지시 목록 보여줘",
                ].map((q) => (
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

          {/* Conversation thread */}
          <MessageThread messages={messages} />

          {/* Approval prompt */}
          {pendingApproval && (
            <div className="mt-4">
              <ApprovalPrompt
                approval={pendingApproval}
                onRespond={respondToApproval}
              />
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="mt-4 rounded-lg border border-red-800/50 bg-red-900/20 p-4 text-sm text-red-400">
              {error}
            </div>
          )}
        </div>
      </main>

      {/* Input */}
      <ChatInput onSend={send} disabled={isStreaming} />
    </div>
  );
}
