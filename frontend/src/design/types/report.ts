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

export type Severity = "good" | "neutral" | "warning" | "alert";

export interface KpiMetric {
  label: string;
  value: number | string;
  delta?: string;
  trend?: "up" | "down" | "flat";
  unit?: string;
  severity?: Severity;
}

export interface BubbleDatum {
  label: string;
  size: number;
  x: number;
  /** Optional y position; when omitted, blocks default to a deterministic layout. */
  y?: number;
  color?: string;
  tags?: string[];
  /** Optional secondary metric (e.g. defect rate) used by category cards. */
  secondary?: number;
}

export interface BubbleCard {
  title: string;
  primary: string | number;
  secondary?: string;
  tags?: string[];
  color_dot?: string;
}

export interface RankedRow {
  name: string;
  primary: string | number;
  secondary?: string;
  tags?: string[];
  color_dot?: string;
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
    }
  | {
      type: "bubble_breakdown";
      title?: string;
      data_ref: number;
      bubble: { label: string; size: string; x: string; color?: string };
      cards?: BubbleCard[];
      layout?: "row" | "stack";
    }
  | {
      type: "kpi_grid";
      title?: string;
      columns?: 2 | 3 | 4;
      metrics: KpiMetric[];
    }
  | {
      type: "ranked_list";
      title?: string;
      data_ref: number;
      fields: { name: string; primary: string; secondary?: string; tags?: string; color_dot?: string };
      limit?: number;
      highlight_top?: number;
      subtitle?: string;
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
