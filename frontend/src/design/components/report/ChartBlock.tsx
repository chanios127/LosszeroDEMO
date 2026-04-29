import type { ReportBlock, DataRef } from "../../types/report";
import { SwitchableViz } from "../VizPanel";

type ChartBlockType = Extract<ReportBlock, { type: "chart" }>;

interface ChartBlockProps {
  block: ChartBlockType;
  dataRef: DataRef | undefined;
}

function Placeholder({ message }: { message: string }) {
  return (
    <div
      className="card dot-bg"
      style={{
        padding: "var(--space-5)",
        textAlign: "center",
        color: "var(--text-muted)",
        fontSize: 13,
      }}
    >
      {message}
    </div>
  );
}

export function ChartBlock({ block, dataRef }: ChartBlockProps) {
  if (!dataRef) {
    return (
      <Placeholder
        message={`chart block references data_ref=${block.data_ref} which does not exist`}
      />
    );
  }

  if (dataRef.mode === "ref") {
    return (
      <Placeholder
        message={`data hydrate pending — ref_id=${dataRef.ref_id}, rows=${dataRef.row_count}`}
      />
    );
  }

  // SwitchableViz wraps Recharts charts in ResponsiveContainer internally.
  // Do NOT add an outer ResponsiveContainer here.
  return (
    <div
      className="card"
      style={{
        padding: "var(--space-4)",
      }}
    >
      <SwitchableViz
        data={dataRef.rows}
        initialHint={block.viz_hint}
        title={block.title}
      />
    </div>
  );
}
