import { useState } from "react";
import type { Conversation } from "../hooks/useConversationStore";

interface ConversationListProps {
  conversations: Conversation[];
  currentId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onDownload: (id: string) => void;
  onNew: () => void;
}

function formatTime(ts: number): string {
  const now = Date.now();
  const diff = now - ts;
  if (diff < 60_000) return "방금";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}분 전`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}시간 전`;
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()}`;
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

  const filtered = conversations.filter((c) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    if (c.title.toLowerCase().includes(q)) return true;
    return c.messages.some((m) => m.content.toLowerCase().includes(q));
  });

  const handleRenameStart = (c: Conversation) => {
    setEditingId(c.id);
    setEditTitle(c.title);
  };

  const handleRenameCommit = (id: string) => {
    const trimmed = editTitle.trim();
    if (trimmed) onRename(id, trimmed);
    setEditingId(null);
  };

  return (
    <div className="flex h-full flex-col border-r border-slate-800 bg-slate-900/30">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-slate-800 p-3">
        <button
          onClick={onNew}
          className="flex-1 rounded-lg bg-brand-500/20 px-3 py-2 text-xs font-medium
            text-brand-500 hover:bg-brand-500/30"
        >
          + 새 대화
        </button>
      </div>

      {/* Search */}
      <div className="border-b border-slate-800 p-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="대화 검색..."
          className="w-full rounded bg-slate-800 px-3 py-1.5 text-xs text-slate-200
            placeholder-slate-500 outline-none focus:ring-1 focus:ring-brand-500"
        />
      </div>

      {/* List */}
      <div className="flex-1 overflow-auto">
        {filtered.length === 0 && (
          <div className="p-4 text-center text-xs text-slate-600">
            {conversations.length === 0 ? "저장된 대화 없음" : "검색 결과 없음"}
          </div>
        )}

        {filtered.map((c) => (
          <div
            key={c.id}
            onClick={() => onSelect(c.id)}
            className={`group cursor-pointer border-b border-slate-800/50 p-3 transition-colors
              ${currentId === c.id
                ? "bg-brand-500/10 border-l-2 border-l-brand-500"
                : "hover:bg-slate-800/50"
              }`}
          >
            {editingId === c.id ? (
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                onBlur={() => handleRenameCommit(c.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleRenameCommit(c.id);
                  if (e.key === "Escape") setEditingId(null);
                }}
                autoFocus
                onClick={(e) => e.stopPropagation()}
                className="w-full rounded bg-slate-800 px-2 py-1 text-sm text-slate-100
                  outline-none ring-1 ring-brand-500"
              />
            ) : (
              <h4 className="text-sm font-medium text-slate-200 truncate">
                {c.title}
              </h4>
            )}
            <div className="mt-1 flex items-center justify-between text-[10px] text-slate-500">
              <span>
                {c.domainLabel} · {c.messages.length / 2}턴
              </span>
              <span>{formatTime(c.updatedAt)}</span>
            </div>

            {/* Hover actions */}
            <div className="mt-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={(e) => { e.stopPropagation(); handleRenameStart(c); }}
                className="rounded bg-slate-800 px-2 py-0.5 text-[10px] text-slate-400 hover:bg-slate-700"
                title="이름 변경"
              >
                ✏️
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onDownload(c.id); }}
                className="rounded bg-slate-800 px-2 py-0.5 text-[10px] text-slate-400 hover:bg-slate-700"
                title="Markdown 다운로드"
              >
                ⬇️
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirm(`"${c.title}" 대화를 삭제하시겠습니까?`)) {
                    onDelete(c.id);
                  }
                }}
                className="rounded bg-slate-800 px-2 py-0.5 text-[10px] text-red-400 hover:bg-red-900/50"
                title="삭제"
              >
                🗑️
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
