import sample from "../../design/components/report/__fixtures__/sample.json";
import { ReportContainer } from "../../design/components/report/ReportContainer";
import type { ReportSchema } from "../../design/types/report";

export default function ReportDemoPage() {
  return (
    <div
      style={{
        height: "100%",
        overflowY: "auto",
        background: "var(--bg)",
      }}
    >
      <ReportContainer schema={sample as ReportSchema} />
    </div>
  );
}
