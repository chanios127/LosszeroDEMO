import type { ResultEntry } from "../types/events";
import { SwitchableViz, VIZ_ICON_MAP } from "./VizPanel";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function relativeTime(timestamp: number): string {
  const diff = Math.floor((Date.now() - timestamp) / 1000);
  if (diff < 60) return "방금";
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  return `${Math.floor(diff / 86400)}일 전`;
}

// ---------------------------------------------------------------------------
// ResultHistoryItem
// ---------------------------------------------------------------------------
function ResultHistoryItem({
  entry,
  isActive,
  onClick,
}: {
  entry: ResultEntry;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full border-l-2 px-3 py-2 text-left transition-colors ${
        isActive
          ? "border-brand-500 bg-bg-elev-2"
          : "border-transparent hover:bg-bg-elev-2"
      }`}
    >
      <div className="flex items-center gap-2">
        <span className="shrink-0 rounded bg-bg-elev-2 px-1.5 py-0.5 text-xs text-text-muted">
          {VIZ_ICON_MAP[entry.vizHint]}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm text-text-base">
          {entry.query}
        </span>
        <span className="shrink-0 text-xs text-text-dim">
          {relativeTime(entry.timestamp)}
        </span>
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// ActiveResultView
// ---------------------------------------------------------------------------
function ActiveResultView({ entry }: { entry: ResultEntry }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-text-strong leading-snug">
          {entry.query}
        </p>
        <span className="shrink-0 text-xs text-text-dim">
          {new Date(entry.timestamp).toLocaleTimeString("ko-KR", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      </div>

      {entry.data && entry.data.length > 0 ? (
        <SwitchableViz
          key={entry.id}
          data={entry.data}
          initialHint={entry.vizHint}
        />
      ) : (
        <div className="rounded-lg border border-border-subtle bg-bg-elev-1 p-4">
          <p className="text-sm text-text-base whitespace-pre-wrap">
            {entry.answer}
          </p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ResultsBoard
// ---------------------------------------------------------------------------
interface ResultsBoardProps {
  results: ResultEntry[];
  activeResultId: string | null;
  onSelectResult: (id: string) => void;
}

export default function ResultsBoard({
  results,
  activeResultId,
  onSelectResult,
}: ResultsBoardProps) {
  if (results.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <span className="text-4xl text-text-faint">⊞</span>
        <p className="text-sm text-text-dim">아직 결과가 없습니다</p>
        <p className="text-xs text-text-faint">
          쿼리를 전송하면 결과가 여기에 표시됩니다
        </p>
      </div>
    );
  }

  const activeEntry =
    results.find((r) => r.id === activeResultId) ??
    results[results.length - 1];

  const historyItems = [...results].reverse();

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Active result view */}
      <div className="flex-1 overflow-auto p-4">
        <ActiveResultView entry={activeEntry} />
      </div>

      {/* History list */}
      {results.length > 1 && (
        <div className="max-h-56 overflow-auto border-t border-border-subtle">
          <div className="px-3 py-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-text-dim">
              이전 결과
            </span>
          </div>
          {historyItems.map((entry) => (
            <ResultHistoryItem
              key={entry.id}
              entry={entry}
              isActive={entry.id === activeEntry.id}
              onClick={() => onSelectResult(entry.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
