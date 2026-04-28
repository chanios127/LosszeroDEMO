import { useState } from "react";
import DataSourceStep from "../components/builder/DataSourceStep";
import VizSuggestionStep from "../components/builder/VizSuggestionStep";

type Step = "data" | "viz";

export default function UIBuilderPage() {
  const [step, setStep] = useState<Step>("data");
  const [data, setData] = useState<Record<string, unknown>[] | null>(null);
  const [, setSourceSql] = useState<string>("");

  const handleDataReady = (d: Record<string, unknown>[], sql: string) => {
    setData(d);
    setSourceSql(sql);
    setStep("viz");
  };

  const handleBack = () => {
    setStep("data");
  };

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-4xl px-6 py-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-xl font-bold text-text-strong">UI 빌더</h1>
          <p className="mt-1 text-sm text-text-dim">
            데이터를 수집하고 AI가 제안하는 시각화로 위젯을 조립합니다.
          </p>
        </div>

        {/* Step indicator */}
        <div className="mb-6 flex items-center gap-2">
          <StepBadge active={step === "data"} completed={step === "viz"} label="1. 데이터" />
          <div className="h-px flex-1 bg-bg-elev-2" />
          <StepBadge active={step === "viz"} completed={false} label="2. 시각화" />
          <div className="h-px flex-1 bg-bg-elev-2" />
          <StepBadge active={false} completed={false} label="3. 위젯 (준비 중)" disabled />
        </div>

        {/* Step content */}
        <div className="rounded-xl border border-border-subtle bg-bg-elev-1 p-5">
          {step === "data" && <DataSourceStep onDataReady={handleDataReady} />}
          {step === "viz" && data && (
            <VizSuggestionStep data={data} onBack={handleBack} />
          )}
        </div>
      </div>
    </div>
  );
}

function StepBadge({
  active,
  completed,
  label,
  disabled,
}: {
  active: boolean;
  completed: boolean;
  label: string;
  disabled?: boolean;
}) {
  return (
    <span
      className={`rounded-full px-3 py-1 text-xs font-medium whitespace-nowrap ${
        disabled
          ? "bg-bg-elev-1 text-text-faint"
          : active
            ? "bg-brand-500 text-white"
            : completed
              ? "bg-success/30 text-success"
              : "bg-bg-elev-2 text-text-dim"
      }`}
    >
      {label}
    </span>
  );
}
