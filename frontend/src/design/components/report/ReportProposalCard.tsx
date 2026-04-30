import { useState } from "react";

export interface ReportProposalMeta {
  blocks: number;
  dataRefs: number;
  domain: string;
  schemaVersion?: string;
}

export interface ReportProposal {
  idTemp: string;
  title: string;
  summary: string;
  meta: ReportProposalMeta;
  tags?: string[];
}

interface ReportProposalCardProps {
  proposal: ReportProposal;
  onArchive?: (idTemp: string, edits?: { title?: string; tags?: string[] }) => void;
  onDiscard?: (idTemp: string) => void;
  /** Phase A renders props-only; SSE/POST wiring lands in Phase C. */
  disabled?: boolean;
}

export function ReportProposalCard({
  proposal,
  onArchive,
  onDiscard,
  disabled,
}: ReportProposalCardProps) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(proposal.title);
  const [tagsText, setTagsText] = useState((proposal.tags ?? []).join(", "));

  const archive = (withEdits: boolean) => {
    if (!onArchive) return;
    if (withEdits) {
      const tags = tagsText
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      onArchive(proposal.idTemp, { title, tags });
    } else {
      onArchive(proposal.idTemp);
    }
  };

  return (
    <div
      className="card"
      style={{
        padding: "var(--space-4)",
        borderTop: "2px solid var(--brand-500)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-3)",
        maxWidth: 720,
        boxShadow: "var(--shadow-md)",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: 8,
            flexShrink: 0,
            background:
              "color-mix(in oklch, var(--brand-500) 18%, transparent)",
            color: "var(--brand-300)",
            display: "grid",
            placeItems: "center",
            fontSize: 14,
          }}
        >
          📋
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            className="mono"
            style={{
              fontSize: 10,
              color: "var(--brand-300)",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              marginBottom: 4,
            }}
          >
            보고서 제안 · HITL 대기
          </div>
          {editing ? (
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              style={{
                width: "100%",
                fontSize: 15,
                fontWeight: 600,
                color: "var(--text-strong)",
                background: "var(--bg)",
                border: "1px solid var(--border)",
                borderRadius: "var(--r-md)",
                padding: "6px 8px",
              }}
            />
          ) : (
            <h3
              style={{
                margin: 0,
                fontSize: 15,
                fontWeight: 600,
                color: "var(--text-strong)",
              }}
            >
              {title}
            </h3>
          )}
        </div>
      </div>

      <p
        style={{
          margin: 0,
          fontSize: 13,
          color: "var(--text)",
          lineHeight: 1.55,
        }}
      >
        {proposal.summary}
      </p>

      {editing && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span
            className="mono"
            style={{ fontSize: 10, color: "var(--text-faint)" }}
          >
            tags (comma separated)
          </span>
          <input
            value={tagsText}
            onChange={(e) => setTagsText(e.target.value)}
            style={{
              fontSize: 12,
              color: "var(--text)",
              background: "var(--bg)",
              border: "1px solid var(--border)",
              borderRadius: "var(--r-md)",
              padding: "6px 8px",
            }}
          />
        </div>
      )}

      <div
        className="mono"
        style={{
          display: "flex",
          gap: 14,
          flexWrap: "wrap",
          fontSize: 10.5,
          color: "var(--text-faint)",
          padding: "8px 10px",
          background: "var(--bg)",
          borderRadius: "var(--r-md)",
          border: "1px dashed var(--border-subtle)",
        }}
      >
        <span>
          blocks · <strong style={{ color: "var(--text)" }}>{proposal.meta.blocks}</strong>
        </span>
        <span>
          data_refs ·{" "}
          <strong style={{ color: "var(--text)" }}>{proposal.meta.dataRefs}</strong>
        </span>
        <span>
          domain ·{" "}
          <strong style={{ color: "var(--text)" }}>{proposal.meta.domain}</strong>
        </span>
        <span>
          schema_version ·{" "}
          <strong style={{ color: "var(--text)" }}>
            {proposal.meta.schemaVersion ?? "1.0"}
          </strong>
        </span>
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button
          type="button"
          disabled={disabled}
          onClick={() => archive(editing)}
          style={{
            padding: "8px 14px",
            fontSize: 12,
            fontWeight: 500,
            borderRadius: "var(--r-md)",
            background: "var(--brand-500)",
            color: "var(--bg)",
            border: "1px solid var(--brand-600)",
            opacity: disabled ? 0.5 : 1,
          }}
        >
          📥 {editing ? "수정 후 보관" : "보관"}
        </button>
        {!editing && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => setEditing(true)}
            style={{
              padding: "8px 14px",
              fontSize: 12,
              borderRadius: "var(--r-md)",
              background: "var(--bg-elev-2)",
              color: "var(--text-strong)",
              border: "1px solid var(--border)",
              opacity: disabled ? 0.5 : 1,
            }}
          >
            ✎ 수정
          </button>
        )}
        <button
          type="button"
          disabled={disabled}
          onClick={() => onDiscard?.(proposal.idTemp)}
          style={{
            padding: "8px 14px",
            fontSize: 12,
            borderRadius: "var(--r-md)",
            color: "var(--text-muted)",
            border: "1px solid var(--border-subtle)",
            background: "transparent",
            opacity: disabled ? 0.5 : 1,
          }}
        >
          🗑 버리기
        </button>
        <span
          className="mono"
          style={{
            marginLeft: "auto",
            fontSize: 10,
            color: "var(--text-faint)",
          }}
        >
          stream_key · {proposal.idTemp}
        </span>
      </div>
    </div>
  );
}
