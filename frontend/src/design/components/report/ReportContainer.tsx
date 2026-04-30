import type { ReportSchema, ReportBlock, DataRef } from "../../types/report";
import type { ViewBlockSpec } from "../../types/view";
import { MetricCard } from "./MetricCard";
import { MarkdownBlock } from "./MarkdownBlock";
import { HighlightCard } from "./HighlightCard";
import { ChartBlock } from "./ChartBlock";
import { BubbleBreakdownBlock } from "./BubbleBreakdownBlock";
import { KpiGridBlock } from "./KpiGridBlock";
import { RankedListBlock } from "./RankedListBlock";
import { GanttBlock } from "./GanttBlock";
import { RadarBlock } from "./RadarBlock";

interface ReportContainerProps {
  schema: ReportSchema;
  /** Phase 9.5 — when present, route blocks by ViewBlockSpec.component.
   *  When absent (e.g. /report-demo fixture), fall back to ReportBlock.type. */
  blockSpecs?: ViewBlockSpec[];
}

function renderByComponent(
  block: ReportBlock,
  index: number,
  dataRefs: DataRef[],
  component: ViewBlockSpec["component"],
) {
  const key = `${component}-${index}`;
  switch (component) {
    case "MarkdownBlock":
      if (block.type === "markdown") {
        return <MarkdownBlock key={key} content={block.content} />;
      }
      return null;
    case "MetricCard":
      if (block.type === "metric") {
        return <MetricCard key={key} {...block} />;
      }
      return null;
    case "HighlightCard":
      if (block.type === "highlight") {
        return <HighlightCard key={key} {...block} />;
      }
      return null;
    case "ChartBlock":
      if (block.type === "chart") {
        return (
          <ChartBlock
            key={key}
            block={block}
            dataRef={dataRefs[block.data_ref]}
          />
        );
      }
      return null;
    case "BubbleBreakdownBlock":
      if (block.type === "bubble_breakdown") {
        return (
          <BubbleBreakdownBlock
            key={key}
            block={block}
            dataRef={dataRefs[block.data_ref]}
          />
        );
      }
      return null;
    case "KpiGridBlock":
      if (block.type === "kpi_grid") {
        return <KpiGridBlock key={key} {...block} />;
      }
      return null;
    case "RankedListBlock":
      if (block.type === "ranked_list") {
        return (
          <RankedListBlock
            key={key}
            block={block}
            dataRef={dataRefs[block.data_ref]}
          />
        );
      }
      return null;
    case "GanttBlock":
      if (block.type === "chart") {
        return (
          <GanttBlock
            key={key}
            block={block}
            dataRef={dataRefs[block.data_ref]}
          />
        );
      }
      return null;
    case "RadarBlock":
      if (block.type === "chart") {
        return (
          <RadarBlock
            key={key}
            block={block}
            dataRef={dataRefs[block.data_ref]}
          />
        );
      }
      return null;
  }
}

function renderByType(
  block: ReportBlock,
  index: number,
  dataRefs: DataRef[],
) {
  const key = `${block.type}-${index}`;
  switch (block.type) {
    case "markdown":
      return <MarkdownBlock key={key} content={block.content} />;
    case "metric":
      return <MetricCard key={key} {...block} />;
    case "highlight":
      return <HighlightCard key={key} {...block} />;
    case "chart":
      if (block.viz_hint === "gantt") {
        return (
          <GanttBlock
            key={key}
            block={block}
            dataRef={dataRefs[block.data_ref]}
          />
        );
      }
      if (block.viz_hint === "radar") {
        return (
          <RadarBlock
            key={key}
            block={block}
            dataRef={dataRefs[block.data_ref]}
          />
        );
      }
      return (
        <ChartBlock
          key={key}
          block={block}
          dataRef={dataRefs[block.data_ref]}
        />
      );
    case "bubble_breakdown":
      return (
        <BubbleBreakdownBlock
          key={key}
          block={block}
          dataRef={dataRefs[block.data_ref]}
        />
      );
    case "kpi_grid":
      return <KpiGridBlock key={key} {...block} />;
    case "ranked_list":
      return (
        <RankedListBlock
          key={key}
          block={block}
          dataRef={dataRefs[block.data_ref]}
        />
      );
  }
}

function renderBlock(
  block: ReportBlock,
  index: number,
  dataRefs: DataRef[],
  blockSpec: ViewBlockSpec | undefined,
) {
  if (blockSpec?.component) {
    return renderByComponent(block, index, dataRefs, blockSpec.component);
  }
  return renderByType(block, index, dataRefs);
}

export function ReportContainer({ schema, blockSpecs }: ReportContainerProps) {
  const specByIndex = new Map<number, ViewBlockSpec>();
  if (blockSpecs) {
    for (const spec of blockSpecs) {
      specByIndex.set(spec.index, spec);
    }
  }
  return (
    <div
      style={{
        maxWidth: 960,
        margin: "0 auto",
        padding: "var(--space-6) var(--space-5)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-5)",
      }}
    >
      <header
        style={{ display: "flex", flexDirection: "column", gap: 6 }}
      >
        <h1
          style={{
            margin: 0,
            fontSize: 22,
            fontWeight: 600,
            color: "var(--text-strong)",
            letterSpacing: "-0.01em",
          }}
        >
          {schema.title}
        </h1>
        <span
          className="mono"
          style={{
            fontSize: 11,
            color: "var(--text-faint)",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
          }}
        >
          generated_from: {schema.generated_from}
        </span>
      </header>

      <section
        className="card"
        style={{
          padding: "var(--space-5)",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        <p
          style={{
            margin: 0,
            fontSize: 15,
            color: "var(--text-strong)",
            lineHeight: 1.5,
          }}
        >
          {schema.summary.headline}
        </p>
        {schema.summary.insights.length > 0 && (
          <ul
            style={{
              margin: 0,
              paddingLeft: 18,
              color: "var(--text)",
              fontSize: 13,
              display: "flex",
              flexDirection: "column",
              gap: 4,
            }}
          >
            {schema.summary.insights.map((insight, i) => (
              <li key={i}>{insight}</li>
            ))}
          </ul>
        )}
      </section>

      <section
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-4)",
        }}
      >
        {schema.blocks.map((block, i) =>
          renderBlock(block, i, schema.data_refs, specByIndex.get(i)),
        )}
      </section>
    </div>
  );
}
