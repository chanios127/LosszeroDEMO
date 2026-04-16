import { useState } from "react";
import { DataTable } from "../components/VizPanel";

interface QueryResult {
  id: string;
  sql: string;
  data: Record<string, unknown>[] | null;
  error: string | null;
  rows: number;
  executedAt: number;
}

export default function DataQueryPage() {
  const [sql, setSql] = useState("");
  const [results, setResults] = useState<QueryResult[]>([]);
  const [loading, setLoading] = useState(false);

  const executeQuery = async () => {
    const trimmed = sql.trim();
    if (!trimmed || loading) return;

    setLoading(true);

    try {
      // Direct query via the agent — sends a literal SQL execution request
      const res = await fetch("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: `다음 SQL을 실행해줘: ${trimmed}` }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const { status: streamKey } = await res.json();

      // Collect SSE events
      const es = new EventSource(`/api/stream/${streamKey}`);
      let resultData: Record<string, unknown>[] | null = null;
      let errorMsg: string | null = null;

      await new Promise<void>((resolve) => {
        es.addEventListener("tool_result", (e) => {
          try {
            const evt = JSON.parse(e.data);
            if (evt.output && Array.isArray(evt.output)) {
              resultData = evt.output;
            }
            if (evt.error) errorMsg = evt.error;
          } catch { /* skip */ }
        });

        es.addEventListener("final", () => { es.close(); resolve(); });
        es.addEventListener("error", (e) => {
          try {
            const evt = JSON.parse((e as MessageEvent).data);
            errorMsg = evt.message;
          } catch { /* skip */ }
          es.close();
          resolve();
        });

        es.onerror = () => { es.close(); resolve(); };
      });

      setResults((prev) => [
        {
          id: crypto.randomUUID(),
          sql: trimmed,
          data: resultData,
          error: errorMsg,
          rows: resultData?.length ?? 0,
          executedAt: Date.now(),
        },
        ...prev,
      ]);
    } catch (err) {
      setResults((prev) => [
        {
          id: crypto.randomUUID(),
          sql: trimmed,
          data: null,
          error: err instanceof Error ? err.message : "Unknown error",
          rows: 0,
          executedAt: Date.now(),
        },
        ...prev,
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      executeQuery();
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* SQL input */}
      <div className="border-b border-slate-800 p-4 shrink-0">
        <div className="mx-auto max-w-5xl">
          <label className="mb-2 block text-xs font-medium text-slate-400">
            SQL Query (Ctrl+Enter to execute)
          </label>
          <textarea
            value={sql}
            onChange={(e) => setSql(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="SELECT TOP 10 * FROM ..."
            rows={4}
            className="w-full resize-none rounded-lg bg-slate-800 px-4 py-3 font-mono text-sm
              text-slate-100 placeholder-slate-500 outline-none focus:ring-2 focus:ring-brand-500"
          />
          <div className="mt-2 flex items-center justify-between">
            <p className="text-[10px] text-slate-600">
              읽기 전용 — SELECT만 허용, DML/DDL 차단
            </p>
            <button
              onClick={executeQuery}
              disabled={loading || !sql.trim()}
              className="rounded bg-brand-500 px-4 py-1.5 text-sm font-medium text-white
                hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {loading ? "실행 중..." : "실행"}
            </button>
          </div>
        </div>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-auto p-4">
        <div className="mx-auto max-w-5xl space-y-4">
          {results.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="text-3xl mb-3">📊</div>
              <p className="text-sm text-slate-500">
                SQL 쿼리를 입력하고 실행하면 결과가 여기에 표시됩니다.
              </p>
            </div>
          )}

          {results.map((r) => (
            <div key={r.id} className="rounded-lg border border-slate-800 bg-slate-900/50">
              {/* Query header */}
              <div className="flex items-center justify-between border-b border-slate-800 px-4 py-2">
                <code className="text-xs text-slate-400 truncate max-w-[80%]">
                  {r.sql}
                </code>
                <span className="text-[10px] text-slate-600">
                  {r.rows} rows / {new Date(r.executedAt).toLocaleTimeString()}
                </span>
              </div>

              {/* Result body */}
              <div className="p-4">
                {r.error ? (
                  <p className="text-sm text-red-400">{r.error}</p>
                ) : r.data && r.data.length > 0 ? (
                  <DataTable data={r.data} />
                ) : (
                  <p className="text-sm text-slate-500">결과 없음</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
