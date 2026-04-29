// Phase 9.5 — frontend mirror of backend tools/build_view/schema.py
// ViewBundle is what build_view tool emits: enriched ReportSchema +
// per-block component routing. ReportContainer trusts ViewBlockSpec.component
// when blockSpecs are supplied.
//
// Locked schema: do NOT change without coordinating with backend
// tools/build_view/schema.py and ReportContainer renderer.

import type { ReportSchema } from "./report";

export type ViewBlockComponent =
  | "MarkdownBlock"
  | "MetricCard"
  | "ChartBlock"
  | "HighlightCard";

export interface ViewBlockSpec {
  /** Index into ReportSchema.blocks[] — must align 1:1 with the schema. */
  index: number;
  /** Frontend component to render for this block. */
  component: ViewBlockComponent;
}

export interface ViewBundle {
  schema: ReportSchema;
  blocks: ViewBlockSpec[];
}
