import { useEffect, useState } from "react";
import { SwitchableViz } from "../../../design/components/VizPanel";
import type { VizHint } from "../../../design/types/events";

interface VizSuggestion {
  viz_hint: VizHint;
  x_axis: string | null;
  y_axis: string | null;
  reasoning: string;
}

interface VizSuggestionStepProps {
  data: Record<string, unknown>[];
  onBack: () => void;
}

export default function VizSuggestionStep({
  data,
  onBack,
}: VizSuggestionStepProps) {
  const [suggestion, setSuggestion] = useState<VizSuggestion | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch("/api/suggest_viz", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sample: data.slice(0, 5) }),
    })
      .then((r) => r.json())
      .then((body) => {
        if (cancelled) return;
        setSuggestion(body);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Unknown error");
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [data]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-text-base">
            2. 시각화 구상
          </h3>
          <p className="text-xs text-text-dim">
            LLM이 데이터 형태를 분석해 추천 차트를 제안합니다.
          </p>
        </div>
        <button
          onClick={onBack}
          className="rounded bg-bg-elev-2 px-3 py-1.5 text-xs text-text-muted hover:bg-bg-elev-3"
        >
          ← 데이터 다시 선택
        </button>
      </div>

      {loading && (
        <div className="rounded-lg border border-border-subtle bg-bg-elev-1 p-8 text-center">
          <p className="text-sm text-text-dim">LLM 분석 중...</p>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-[color:color-mix(in_oklch,var(--danger)_30%,transparent)] bg-[color:color-mix(in_oklch,var(--danger)_15%,transparent)] p-4 text-sm text-danger">
          {error}
        </div>
      )}

      {suggestion && !loading && (
        <>
          <div className="rounded-lg border border-border-subtle bg-bg-elev-1 p-4">
            <p className="text-[10px] font-semibold uppercase text-text-dim mb-1">
              추천 차트: {suggestion.viz_hint}
            </p>
            <p className="text-sm text-text-base">{suggestion.reasoning}</p>
            {(suggestion.x_axis || suggestion.y_axis) && (
              <p className="mt-2 text-xs text-text-dim">
                {suggestion.x_axis && `X: ${suggestion.x_axis}`}
                {suggestion.x_axis && suggestion.y_axis && " · "}
                {suggestion.y_axis && `Y: ${suggestion.y_axis}`}
              </p>
            )}
          </div>

          <div className="rounded-lg border border-border-subtle bg-bg-elev-1 p-4">
            <SwitchableViz data={data} initialHint={suggestion.viz_hint} />
          </div>

          <div className="flex gap-2 justify-end">
            <button
              disabled
              className="rounded bg-bg-elev-2 px-4 py-1.5 text-sm text-text-dim cursor-not-allowed"
              title="Phase 6에서 제공"
            >
              위젯으로 저장 (준비 중)
            </button>
          </div>
        </>
      )}
    </div>
  );
}
