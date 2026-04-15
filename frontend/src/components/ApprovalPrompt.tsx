import type { PendingApproval } from "../hooks/useAgentStream";

interface ApprovalPromptProps {
  approval: PendingApproval;
  onRespond: (streamKey: string, approved: boolean) => void;
}

export default function ApprovalPrompt({
  approval,
  onRespond,
}: ApprovalPromptProps) {
  return (
    <div className="mx-auto max-w-4xl animate-in fade-in">
      <div className="rounded-lg border border-yellow-700/50 bg-yellow-900/20 p-4">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 text-xl">🔐</span>
          <div className="flex-1 space-y-3">
            <div>
              <h3 className="text-sm font-semibold text-yellow-300">
                도구 실행 승인 필요
              </h3>
              <p className="mt-1 text-sm text-slate-300">{approval.reason}</p>
            </div>

            <div className="rounded bg-slate-800/50 p-3">
              <p className="text-xs font-medium text-slate-400">
                Tool: <span className="text-yellow-300">{approval.tool}</span>
              </p>
              <pre className="mt-1 max-h-24 overflow-auto text-xs text-slate-400">
                {JSON.stringify(approval.input, null, 2)}
              </pre>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => onRespond(approval.streamKey, true)}
                className="rounded bg-green-600 px-4 py-1.5 text-sm font-medium text-white
                  transition hover:bg-green-500"
              >
                승인
              </button>
              <button
                onClick={() => onRespond(approval.streamKey, false)}
                className="rounded bg-slate-700 px-4 py-1.5 text-sm font-medium text-slate-300
                  transition hover:bg-slate-600"
              >
                거부
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
