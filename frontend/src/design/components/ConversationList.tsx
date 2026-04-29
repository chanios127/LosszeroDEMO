import { useMemo, useState } from "react";
import type { Conversation } from "../types/chat";
import { IconPlus, IconSearch } from "./icons";
import { Button, fmtRel } from "./primitives";

interface ConversationListProps {
  conversations: Conversation[];
  currentId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onDownload: (id: string) => void;
  onNew: () => void;
}

interface ItemProps {
  c: Conversation;
  active: boolean;
  editing: boolean;
  editTitle: string;
  onSelect: () => void;
  onStartRename: () => void;
  onCommitRename: () => void;
  onChangeRename: (v: string) => void;
  onCancelRename: () => void;
  onDelete: () => void;
  onDownload: () => void;
}

function ConversationItem({
  c,
  active,
  editing,
  editTitle,
  onSelect,
  onStartRename,
  onCommitRename,
  onChangeRename,
  onCancelRename,
  onDelete,
  onDownload,
}: ItemProps) {
  return (
    <div
      onClick={() => !editing && onSelect()}
      className="group"
      style={{
        position: "relative",
        margin: "0 6px",
        padding: "8px 10px",
        borderRadius: 8,
        cursor: editing ? "text" : "pointer",
        background: active
          ? "color-mix(in oklch, var(--brand-500) 12%, transparent)"
          : "transparent",
        transition: "background 120ms",
      }}
      onMouseEnter={(e) => {
        if (!active)
          e.currentTarget.style.background = "var(--bg-elev-2)";
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.background = "transparent";
      }}
    >
      {editing ? (
        <input
          autoFocus
          value={editTitle}
          onChange={(e) => onChangeRename(e.target.value)}
          onBlur={onCommitRename}
          onKeyDown={(e) => {
            if (e.key === "Enter") onCommitRename();
            if (e.key === "Escape") onCancelRename();
          }}
          onClick={(e) => e.stopPropagation()}
          style={{
            width: "100%",
            background: "var(--bg)",
            border: "1px solid var(--brand-500)",
            borderRadius: 6,
            padding: "4px 6px",
            fontSize: 13,
            color: "var(--text-strong)",
            outline: "none",
          }}
        />
      ) : (
        <>
          <div
            style={{
              fontSize: 13,
              color: active ? "var(--brand-500)" : "var(--text-strong)",
              fontWeight: active ? 500 : 400,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              paddingRight: 20,
            }}
          >
            {c.title}
          </div>
          <div
            className="mono"
            style={{
              fontSize: 10,
              color: "var(--text-faint)",
              marginTop: 2,
              display: "flex",
              gap: 6,
            }}
          >
            <span>{fmtRel(c.updatedAt)}</span>
            <span>·</span>
            <span>{Math.max(1, Math.ceil(c.messages.length / 2))}턴</span>
          </div>

          {/* Hover actions */}
          <div
            className="opacity-0 group-hover:opacity-100 transition-opacity"
            style={{
              position: "absolute",
              top: 6,
              right: 6,
              display: "flex",
              gap: 2,
            }}
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                onStartRename();
              }}
              title="이름 변경"
              className="focus-ring"
              style={{
                width: 22,
                height: 22,
                borderRadius: 4,
                display: "grid",
                placeItems: "center",
                fontSize: 11,
                color: "var(--text-faint)",
              }}
            >
              ✎
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDownload();
              }}
              title="Markdown 다운로드"
              className="focus-ring"
              style={{
                width: 22,
                height: 22,
                borderRadius: 4,
                display: "grid",
                placeItems: "center",
                fontSize: 11,
                color: "var(--text-faint)",
              }}
            >
              ↓
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (confirm(`"${c.title}" 대화를 삭제하시겠습니까?`)) onDelete();
              }}
              title="삭제"
              className="focus-ring"
              style={{
                width: 22,
                height: 22,
                borderRadius: 4,
                display: "grid",
                placeItems: "center",
                fontSize: 11,
                color: "var(--danger)",
              }}
            >
              ×
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div
        className="mono"
        style={{
          padding: "6px 12px 4px",
          fontSize: 10,
          color: "var(--text-faint)",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
        }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

export default function ConversationList({
  conversations,
  currentId,
  onSelect,
  onDelete,
  onRename,
  onDownload,
  onNew,
}: ConversationListProps) {
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");

  const filtered = useMemo(
    () =>
      conversations
        .filter((c) => {
          if (!search.trim()) return true;
          const q = search.toLowerCase();
          if (c.title.toLowerCase().includes(q)) return true;
          return c.messages.some((m) => m.content.toLowerCase().includes(q));
        })
        .sort((a, b) => b.updatedAt - a.updatedAt),
    [conversations, search],
  );

  const grouped = useMemo(() => {
    const now = Date.now();
    const today: Conversation[] = [];
    const yesterday: Conversation[] = [];
    const earlier: Conversation[] = [];
    for (const c of filtered) {
      const d = now - c.updatedAt;
      if (d < 86_400_000) today.push(c);
      else if (d < 86_400_000 * 2) yesterday.push(c);
      else earlier.push(c);
    }
    return { today, yesterday, earlier };
  }, [filtered]);

  const handleCommitRename = (id: string) => {
    const trimmed = editTitle.trim();
    if (trimmed) onRename(id, trimmed);
    setEditingId(null);
  };

  const renderItem = (c: Conversation) => (
    <ConversationItem
      key={c.id}
      c={c}
      active={c.id === currentId}
      editing={editingId === c.id}
      editTitle={editTitle}
      onSelect={() => onSelect(c.id)}
      onStartRename={() => {
        setEditingId(c.id);
        setEditTitle(c.title);
      }}
      onCommitRename={() => handleCommitRename(c.id)}
      onChangeRename={setEditTitle}
      onCancelRename={() => setEditingId(null)}
      onDelete={() => onDelete(c.id)}
      onDownload={() => onDownload(c.id)}
    />
  );

  return (
    <div
      style={{
        width: 260,
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        borderRight: "1px solid var(--border-subtle)",
        background: "var(--bg)",
      }}
    >
      {/* New chat button */}
      <div style={{ padding: "12px 12px 8px" }}>
        <Button
          variant="secondary"
          size="md"
          onClick={onNew}
          style={{ width: "100%", justifyContent: "center" }}
        >
          <IconPlus />
          <span>새 대화</span>
        </Button>
      </div>

      {/* Search */}
      <div style={{ padding: "0 12px 8px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "6px 10px",
            background: "var(--bg-elev-1)",
            border: "1px solid var(--border-subtle)",
            borderRadius: 8,
            color: "var(--text-faint)",
          }}
        >
          <IconSearch />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="대화 검색..."
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              outline: "none",
              fontSize: 12,
              color: "var(--text-strong)",
            }}
          />
        </div>
      </div>

      {/* List */}
      <div style={{ flex: 1, overflow: "auto", paddingBottom: 8 }}>
        {filtered.length === 0 && (
          <div
            style={{
              padding: 24,
              textAlign: "center",
              fontSize: 12,
              color: "var(--text-faint)",
            }}
          >
            {conversations.length === 0
              ? "저장된 대화 없음"
              : "검색 결과 없음"}
          </div>
        )}
        {grouped.today.length > 0 && (
          <Section label="오늘">{grouped.today.map(renderItem)}</Section>
        )}
        {grouped.yesterday.length > 0 && (
          <Section label="어제">{grouped.yesterday.map(renderItem)}</Section>
        )}
        {grouped.earlier.length > 0 && (
          <Section label="이전">{grouped.earlier.map(renderItem)}</Section>
        )}
      </div>
    </div>
  );
}
