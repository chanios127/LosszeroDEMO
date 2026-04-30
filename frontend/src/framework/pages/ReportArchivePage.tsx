import { useEffect, useMemo, useRef, useState } from "react";
import { ReportContainer } from "../../design/components/report/ReportContainer";
import { useReportArchive } from "../hooks/useReportArchive";
import type { ReportSummary } from "../hooks/useReportArchive";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type GroupBy = "date" | "domain" | "none";

function getDateGroup(createdAt: string | null): string {
  if (!createdAt) return "이전";
  const d = new Date(createdAt);
  const now = new Date();
  const todayStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  );
  const yestStart = new Date(todayStart.getTime() - 86400000);
  const weekStart = new Date(todayStart.getTime() - 6 * 86400000);
  if (d >= todayStart) return "오늘";
  if (d >= yestStart) return "어제";
  if (d >= weekStart) return "이번 주";
  return "이전";
}

function fmtDate(createdAt: string | null): string {
  if (!createdAt) return "—";
  const d = new Date(createdAt);
  return d.toLocaleString("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function groupReports(
  list: ReportSummary[],
  groupBy: GroupBy,
): { label: string; items: ReportSummary[] }[] {
  if (groupBy === "none") return [{ label: "", items: list }];

  const map = new Map<string, ReportSummary[]>();
  for (const r of list) {
    const key =
      groupBy === "date"
        ? getDateGroup(r.created_at)
        : r.domain || "기타";
    const group = map.get(key) ?? [];
    group.push(r);
    map.set(key, group);
  }

  const dateOrder = ["오늘", "어제", "이번 주", "이전"];
  const keys =
    groupBy === "date"
      ? dateOrder.filter((k) => map.has(k))
      : [...map.keys()].sort();

  return keys.map((label) => ({ label, items: map.get(label)! }));
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function EmptyArchive() {
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        padding: "var(--space-8)",
        textAlign: "center",
        color: "var(--text-dim)",
      }}
    >
      <div style={{ fontSize: 48, lineHeight: 1 }}>📂</div>
      <div
        style={{
          fontSize: 15,
          fontWeight: 500,
          color: "var(--text-muted)",
        }}
      >
        아직 보관된 보고서 없음
      </div>
      <p
        style={{
          margin: 0,
          maxWidth: 320,
          fontSize: 13,
          color: "var(--text-faint)",
          lineHeight: 1.6,
        }}
      >
        에이전트 챗봇에서 보고서를 생성하고 HITL 카드의 [보관] 버튼을 눌러
        보고서를 저장하세요.
      </p>
    </div>
  );
}

function EmptyDetail() {
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        color: "var(--text-faint)",
      }}
    >
      <div style={{ fontSize: 32 }}>📄</div>
      <p style={{ margin: 0, fontSize: 13 }}>보고서를 선택하면 여기에 표시됩니다.</p>
    </div>
  );
}

function ReportListItem({
  report,
  active,
  onClick,
}: {
  report: ReportSummary;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: "100%",
        textAlign: "left",
        padding: "10px 12px",
        borderRadius: "var(--r-md)",
        background: active
          ? "color-mix(in oklch, var(--brand-500) 12%, transparent)"
          : "transparent",
        border: "1px solid transparent",
        borderColor: active ? "var(--brand-500)" : "transparent",
        color: active ? "var(--text-strong)" : "var(--text)",
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        gap: 4,
        transition: "background 120ms, border-color 120ms",
      }}
      onMouseEnter={(e) => {
        if (!active) {
          e.currentTarget.style.background = "var(--bg-elev-2)";
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          e.currentTarget.style.background = "transparent";
        }
      }}
    >
      <span
        style={{
          fontSize: 13,
          fontWeight: 500,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          display: "block",
        }}
      >
        {report.title}
      </span>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          flexWrap: "wrap",
        }}
      >
        {report.domain && (
          <span
            className="mono"
            style={{
              fontSize: 10,
              padding: "1px 5px",
              borderRadius: "var(--r-sm)",
              background: "color-mix(in oklch, var(--brand-500) 15%, transparent)",
              color: "var(--brand-300)",
              flexShrink: 0,
            }}
          >
            {report.domain}
          </span>
        )}
        {report.tags.slice(0, 2).map((t) => (
          <span
            key={t}
            style={{
              fontSize: 10,
              padding: "1px 5px",
              borderRadius: "var(--r-sm)",
              background: "var(--bg-elev-2)",
              color: "var(--text-faint)",
              flexShrink: 0,
            }}
          >
            {t}
          </span>
        ))}
        <span
          style={{
            fontSize: 10,
            color: "var(--text-faint)",
            marginLeft: "auto",
            flexShrink: 0,
          }}
        >
          {fmtDate(report.created_at)}
        </span>
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// ReportArchivePage
// ---------------------------------------------------------------------------

interface ReportArchivePageProps {
  /** When true (page is visible) the list refreshes. */
  isVisible?: boolean;
}

export default function ReportArchivePage({
  isVisible = false,
}: ReportArchivePageProps) {
  const { list, selected, loading, error, select, deleteReport, refresh } =
    useReportArchive();

  const [search, setSearch] = useState("");
  const [domainFilter, setDomainFilter] = useState<string>("all");
  const [tagFilter, setTagFilter] = useState("");
  const [groupBy, setGroupBy] = useState<GroupBy>("date");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const detailRef = useRef<HTMLDivElement>(null);

  // Refresh when page becomes visible
  useEffect(() => {
    if (isVisible) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isVisible]);

  // Scroll detail to top when selection changes
  useEffect(() => {
    detailRef.current?.scrollTo({ top: 0 });
  }, [selected?.id]);

  // Unique domains for filter dropdown
  const domains = useMemo(
    () => [...new Set(list.map((r) => r.domain).filter(Boolean))].sort(),
    [list],
  );

  // Filtered + sorted list
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    const tag = tagFilter.toLowerCase();
    return list.filter((r) => {
      if (q && !r.title.toLowerCase().includes(q)) return false;
      if (domainFilter !== "all" && r.domain !== domainFilter) return false;
      if (tag && !r.tags.some((t) => t.toLowerCase().includes(tag)))
        return false;
      return true;
    });
  }, [list, search, domainFilter, tagFilter]);

  const groups = useMemo(
    () => groupReports(filtered, groupBy),
    [filtered, groupBy],
  );

  const handleDelete = async (id: string) => {
    setConfirmDeleteId(null);
    await deleteReport(id);
  };

  // ---- Empty archive (no reports at all, not just filtered) ----
  if (!loading && list.length === 0 && !error) {
    return (
      <div
        style={{
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: "var(--bg)",
        }}
      >
        <ArchiveToolbar
          search={search}
          onSearch={setSearch}
          domainFilter={domainFilter}
          onDomainFilter={setDomainFilter}
          tagFilter={tagFilter}
          onTagFilter={setTagFilter}
          groupBy={groupBy}
          onGroupBy={setGroupBy}
          domains={domains}
          onRefresh={refresh}
          loading={loading}
        />
        <EmptyArchive />
      </div>
    );
  }

  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: "var(--bg)",
        overflow: "hidden",
      }}
    >
      <ArchiveToolbar
        search={search}
        onSearch={setSearch}
        domainFilter={domainFilter}
        onDomainFilter={setDomainFilter}
        tagFilter={tagFilter}
        onTagFilter={setTagFilter}
        groupBy={groupBy}
        onGroupBy={setGroupBy}
        domains={domains}
        onRefresh={refresh}
        loading={loading}
      />

      {error && (
        <div
          style={{
            padding: "8px 16px",
            background:
              "color-mix(in oklch, var(--danger) 15%, transparent)",
            color: "var(--danger)",
            fontSize: 12,
            borderBottom: "1px solid color-mix(in oklch, var(--danger) 30%, transparent)",
          }}
        >
          ⚠ {error} — 캐시된 목록을 표시 중입니다.
        </div>
      )}

      <div
        style={{
          flex: 1,
          display: "flex",
          overflow: "hidden",
        }}
      >
        {/* Left: list sidebar */}
        <aside
          style={{
            width: 280,
            flexShrink: 0,
            borderRight: "1px solid var(--border-subtle)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "8px",
              display: "flex",
              flexDirection: "column",
              gap: 0,
            }}
          >
            {filtered.length === 0 ? (
              <div
                style={{
                  padding: "32px 12px",
                  textAlign: "center",
                  color: "var(--text-faint)",
                  fontSize: 13,
                }}
              >
                검색 결과 없음
              </div>
            ) : (
              groups.map(({ label, items }) => (
                <div key={label || "all"}>
                  {label && (
                    <div
                      className="mono"
                      style={{
                        padding: "10px 12px 4px",
                        fontSize: 10,
                        color: "var(--text-faint)",
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                      }}
                    >
                      {label}
                    </div>
                  )}
                  {items.map((r) => (
                    <ReportListItem
                      key={r.id}
                      report={r}
                      active={selected?.id === r.id}
                      onClick={() => select(r.id)}
                    />
                  ))}
                </div>
              ))
            )}
          </div>
        </aside>

        {/* Right: detail */}
        <div
          ref={detailRef}
          style={{
            flex: 1,
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {loading && !selected ? (
            <div
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--text-faint)",
                fontSize: 13,
              }}
            >
              불러오는 중…
            </div>
          ) : !selected ? (
            <EmptyDetail />
          ) : (
            <>
              {/* Detail header */}
              <div
                style={{
                  padding: "12px 24px",
                  borderBottom: "1px solid var(--border-subtle)",
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 12,
                  flexShrink: 0,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h2
                    style={{
                      margin: "0 0 4px",
                      fontSize: 16,
                      fontWeight: 600,
                      color: "var(--text-strong)",
                    }}
                  >
                    {selected.title}
                  </h2>
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 6,
                      alignItems: "center",
                    }}
                  >
                    {selected.domain && (
                      <span
                        className="mono"
                        style={{
                          fontSize: 10,
                          padding: "2px 6px",
                          borderRadius: "var(--r-sm)",
                          background:
                            "color-mix(in oklch, var(--brand-500) 15%, transparent)",
                          color: "var(--brand-300)",
                        }}
                      >
                        {selected.domain}
                      </span>
                    )}
                    {selected.tags.map((t) => (
                      <span
                        key={t}
                        style={{
                          fontSize: 10,
                          padding: "2px 6px",
                          borderRadius: "var(--r-sm)",
                          background: "var(--bg-elev-2)",
                          color: "var(--text-faint)",
                        }}
                      >
                        {t}
                      </span>
                    ))}
                    <span
                      className="mono"
                      style={{ fontSize: 10, color: "var(--text-faint)" }}
                    >
                      {fmtDate(selected.created_at)}
                    </span>
                  </div>
                </div>

                {/* Delete button / confirm */}
                {confirmDeleteId === selected.id ? (
                  <div
                    style={{
                      display: "flex",
                      gap: 6,
                      alignItems: "center",
                      flexShrink: 0,
                    }}
                  >
                    <span
                      style={{ fontSize: 12, color: "var(--text-muted)" }}
                    >
                      삭제할까요?
                    </span>
                    <button
                      type="button"
                      onClick={() => handleDelete(selected.id)}
                      style={{
                        padding: "4px 10px",
                        fontSize: 12,
                        borderRadius: "var(--r-sm)",
                        background:
                          "color-mix(in oklch, var(--danger) 20%, transparent)",
                        color: "var(--danger)",
                        border: "1px solid color-mix(in oklch, var(--danger) 35%, transparent)",
                      }}
                    >
                      삭제
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(null)}
                      style={{
                        padding: "4px 10px",
                        fontSize: 12,
                        borderRadius: "var(--r-sm)",
                        background: "var(--bg-elev-2)",
                        color: "var(--text-muted)",
                        border: "1px solid var(--border-subtle)",
                      }}
                    >
                      취소
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteId(selected.id)}
                    title="보고서 삭제"
                    style={{
                      padding: "5px 10px",
                      fontSize: 12,
                      borderRadius: "var(--r-sm)",
                      background: "transparent",
                      color: "var(--text-faint)",
                      border: "1px solid var(--border-subtle)",
                      flexShrink: 0,
                    }}
                  >
                    🗑
                  </button>
                )}
              </div>

              {/* Report body */}
              <ReportContainer schema={selected.schema} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ArchiveToolbar — search / filter / group controls
// ---------------------------------------------------------------------------

interface ArchiveToolbarProps {
  search: string;
  onSearch: (v: string) => void;
  domainFilter: string;
  onDomainFilter: (v: string) => void;
  tagFilter: string;
  onTagFilter: (v: string) => void;
  groupBy: GroupBy;
  onGroupBy: (v: GroupBy) => void;
  domains: string[];
  onRefresh: () => void;
  loading: boolean;
}

function ArchiveToolbar({
  search,
  onSearch,
  domainFilter,
  onDomainFilter,
  tagFilter,
  onTagFilter,
  groupBy,
  onGroupBy,
  domains,
  onRefresh,
  loading,
}: ArchiveToolbarProps) {
  const inputStyle: React.CSSProperties = {
    padding: "5px 10px",
    fontSize: 12,
    background: "var(--bg-elev-1)",
    border: "1px solid var(--border-subtle)",
    borderRadius: "var(--r-md)",
    color: "var(--text)",
    outline: "none",
  };

  return (
    <div
      style={{
        padding: "10px 16px",
        borderBottom: "1px solid var(--border-subtle)",
        display: "flex",
        alignItems: "center",
        gap: 8,
        flexWrap: "wrap",
        flexShrink: 0,
        background: "var(--bg-elev-1)",
      }}
    >
      {/* Search */}
      <input
        type="search"
        placeholder="보고서 검색…"
        value={search}
        onChange={(e) => onSearch(e.target.value)}
        style={{ ...inputStyle, width: 180 }}
      />

      {/* Domain filter */}
      {domains.length > 0 && (
        <select
          value={domainFilter}
          onChange={(e) => onDomainFilter(e.target.value)}
          style={{ ...inputStyle, cursor: "pointer" }}
        >
          <option value="all">전체 도메인</option>
          {domains.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      )}

      {/* Tag filter */}
      <input
        type="search"
        placeholder="태그 필터…"
        value={tagFilter}
        onChange={(e) => onTagFilter(e.target.value)}
        style={{ ...inputStyle, width: 120 }}
      />

      {/* Group by */}
      <div
        style={{
          display: "flex",
          gap: 4,
          marginLeft: "auto",
        }}
      >
        {(["date", "domain", "none"] as GroupBy[]).map((g) => (
          <button
            key={g}
            type="button"
            onClick={() => onGroupBy(g)}
            style={{
              padding: "4px 10px",
              fontSize: 11,
              borderRadius: "var(--r-sm)",
              background:
                groupBy === g
                  ? "color-mix(in oklch, var(--brand-500) 15%, transparent)"
                  : "transparent",
              color: groupBy === g ? "var(--brand-400)" : "var(--text-faint)",
              border:
                groupBy === g
                  ? "1px solid var(--brand-500)"
                  : "1px solid transparent",
            }}
          >
            {g === "date" ? "날짜별" : g === "domain" ? "도메인별" : "전체"}
          </button>
        ))}
      </div>

      {/* Refresh */}
      <button
        type="button"
        onClick={onRefresh}
        disabled={loading}
        title="새로고침"
        style={{
          padding: "4px 8px",
          fontSize: 13,
          borderRadius: "var(--r-sm)",
          background: "transparent",
          color: "var(--text-faint)",
          border: "1px solid var(--border-subtle)",
          opacity: loading ? 0.5 : 1,
        }}
      >
        {loading ? "…" : "↺"}
      </button>
    </div>
  );
}
