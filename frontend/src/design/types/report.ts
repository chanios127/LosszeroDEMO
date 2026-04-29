// Phase 9.1 — locked schema. 9.2 BackEnd Infra mirrors this as pydantic models.
// Do NOT change without supervisor coordination across 9.x.

import type { VizHint } from "./events";

export interface ReportSchema {
  title: string;
  generated_from: string;
  summary: {
    headline: string;
    insights: string[]; // 2~5 recommended (UI layout assumption)
  };
  blocks: ReportBlock[];
  data_refs: DataRef[];
}

export type ReportBlock =
  | { type: "markdown"; content: string }
  | {
      type: "metric";
      label: string;
      value: number | string;
      delta?: string;
      trend?: "up" | "down" | "flat";
      unit?: string;
    }
  | {
      type: "chart";
      viz_hint: VizHint;
      data_ref: number; // index into ReportSchema.data_refs[]
      x?: string;
      y?: string | string[];
      group_by?: string;
      title?: string;
    }
  | {
      type: "highlight";
      level: "info" | "warning" | "alert";
      message: string;
      related_data?: number;
    };

export type DataRef =
  | {
      id: number;
      mode: "embed";
      rows: Record<string, unknown>[];
      columns: { name: string; type?: string }[];
    }
  | {
      id: number;
      mode: "ref";
      ref_id: string;
      columns: { name: string; type?: string }[];
      row_count: number;
    };
