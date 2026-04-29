import type { ReportSchema, ReportBlock, DataRef } from "../../types/report";
import { MetricCard } from "./MetricCard";
import { MarkdownBlock } from "./MarkdownBlock";
import { HighlightCard } from "./HighlightCard";
import { ChartBlock } from "./ChartBlock";

interface ReportContainerProps {
  schema: ReportSchema;
}

function renderBlock(
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
      return (
        <ChartBlock
          key={key}
          block={block}
          dataRef={dataRefs[block.data_ref]}
        />
      );
  }
}

export function ReportContainer({ schema }: ReportContainerProps) {
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
          renderBlock(block, i, schema.data_refs),
        )}
      </section>
    </div>
  );
}
