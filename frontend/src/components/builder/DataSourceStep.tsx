import { useState } from "react";
import { DataTable } from "../VizPanel";

type SourceMode = "sql" | "natural";

interface DataSourceStepProps {
  onDataReady: (data: Record<string, unknown>[], sql: string) => void;
}

export default function DataSourceStep({ onDataReady }: DataSourceStepProps) {
  const [mode, setMode] = useState<SourceMode>("sql");
  const [sql, setSql] = useState("");
  const [prompt, setPrompt] = useState("");
  const [generatedSql, setGeneratedSql] = useState("");
  const [preview, setPreview] = useState<Record<string, unknown>[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const executeSql = async (query: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/sql", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sql: query }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail || `HTTP ${res.status}`);
      setPreview(body.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setPreview(null);
    } finally {
      setLoading(false);
    }
  };

  const generateFromNatural = async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/generate_aggregation_sql", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail || `HTTP ${res.status}`);
      setGeneratedSql(body.sql);
      // Auto-execute
      await executeSql(body.sql);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setLoading(false);
    }
  };

  const handleUse = () => {
    if (preview) {
      onDataReady(preview, mode === "sql" ? sql : generatedSql);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-slate-300 mb-2">
          1. 데이터 수집
        </h3>
        <p className="text-xs text-slate-500 mb-3">
          SQL을 직접 입력하거나 자연어로 설명하세요.
        </p>

        {/* Mode tabs */}
        <div className="flex gap-1 mb-3 border-b border-slate-800">
          {(["sql", "natural"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-4 py-2 text-xs transition-colors border-b-2 ${
                mode === m
                  ? "border-brand-500 text-brand-500"
                  : "border-transparent text-slate-500 hover:text-slate-300"
              }`}
            >
              {m === "sql" ? "SQL 직접 입력" : "자연어"}
            </button>
          ))}
        </div>

        {/* SQL mode */}
        {mode === "sql" && (
          <>
            <textarea
              value={sql}
              onChange={(e) => setSql(e.target.value)}
              placeholder="SELECT wcCd, SUM(Qty) FROM ..."
              rows={4}
              className="w-full resize-none rounded-lg bg-slate-800 px-4 py-3 font-mono text-sm
                text-slate-100 placeholder-slate-500 outline-none focus:ring-2 focus:ring-brand-500"
            />
            <button
              onClick={() => executeSql(sql.trim())}
              disabled={loading || !sql.trim()}
              className="mt-2 rounded bg-brand-500 px-4 py-1.5 text-sm font-medium text-white
                hover:bg-brand-700 disabled:opacity-40"
            >
              {loading ? "실행 중..." : "쿼리 실행"}
            </button>
          </>
        )}

        {/* Natural language mode */}
        {mode === "natural" && (
          <>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="예: 공정별로 오늘 총 생산량을 집계해줘"
              rows={3}
              className="w-full resize-none rounded-lg bg-slate-800 px-4 py-3 text-sm
                text-slate-100 placeholder-slate-500 outline-none focus:ring-2 focus:ring-brand-500"
            />
            <button
              onClick={generateFromNatural}
              disabled={loading || !prompt.trim()}
              className="mt-2 rounded bg-brand-500 px-4 py-1.5 text-sm font-medium text-white
                hover:bg-brand-700 disabled:opacity-40"
            >
              {loading ? "생성 중..." : "SQL 생성 + 실행"}
            </button>
            {generatedSql && (
              <div className="mt-3 rounded bg-slate-800/50 p-3">
                <p className="text-[10px] text-slate-500 mb-1">생성된 SQL:</p>
                <code className="text-xs text-slate-300 whitespace-pre-wrap break-all">
                  {generatedSql}
                </code>
              </div>
            )}
          </>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-800/50 bg-red-900/20 p-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Preview */}
      {preview && preview.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-semibold text-slate-400">
              결과 미리보기 ({preview.length} rows)
            </h4>
            <button
              onClick={handleUse}
              className="rounded bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-500"
            >
              이 데이터로 진행 →
            </button>
          </div>
          <div className="max-h-64 overflow-auto">
            <DataTable data={preview.slice(0, 20)} />
          </div>
        </div>
      )}
    </div>
  );
}
