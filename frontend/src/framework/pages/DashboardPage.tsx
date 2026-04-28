import { useEffect, useMemo, useState } from "react";
import type { Page } from "../../design/components/AppShell";
import {
  IconDB,
  IconSparkle,
  IconLayout,
  IconSearch,
  IconArrowR,
  IconBar,
  IconLine,
  IconPie,
  IconTable,
  IconHash,
} from "../../design/components/icons";
import { fmtRel } from "../../design/components/primitives";
import { useConversationStore } from "../hooks/useConversationStore";
import type { Conversation, VizHint } from "../../design/types/events";

interface Module {
  id: Page;
  title: string;
  description: string;
  tags: string[];
  icon: React.ReactNode;
  color: string;
}

const MODULES: Module[] = [
  {
    id: "data-query",
    title: "데이터 조회",
    description:
      "자연어로 ERP 데이터베이스를 조회하고 결과를 차트·테이블로 즉시 시각화합니다.",
    tags: ["SQL 자동 생성", "실시간 시각화", "결과 히스토리"],
    icon: <IconDB />,
    color: "from-brand-500/20 to-cyan-500/10",
  },
  {
    id: "agent-chat",
    title: "에이전트 챗봇",
    description:
      "도메인 특화 AI 에이전트와 심층 분석 대화를 나눕니다.",
    tags: ["도메인 특화", "다중 에이전트", "멀티턴 대화"],
    icon: <IconSparkle />,
    color: "from-violet-500/20 to-purple-500/10",
  },
  {
    id: "ui-builder",
    title: "UI 빌더",
    description:
      "데이터를 수집하고 LLM이 제안하는 시각화로 대시보드 위젯을 조립합니다.",
    tags: ["자연어 → SQL", "AI 차트 제안", "위젯 조립"],
    icon: <IconLayout />,
    color: "from-amber-500/20 to-orange-500/10",
  },
];

const SUGGESTED_QUERIES = [
  { icon: "📊", text: "라인별 이번주 불량률" },
  { icon: "📈", text: "최근 10주 손실률 추이" },
  { icon: "🔍", text: "L3 용접라인 원인 분포" },
  { icon: "#", text: "현재 수율 값" },
];

function formatDate(d: Date): string {
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  return `${days[d.getDay()]} · ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

// ---------------------------------------------------------------------------
// QuickAsk — input + suggested chips → navigates to chat with pendingQuery
// ---------------------------------------------------------------------------

function QuickAsk({ onAsk }: { onAsk: (query: string) => void }) {
  const [v, setV] = useState("");
  const submit = () => {
    const t = v.trim();
    if (!t) return;
    onAsk(t);
    setV("");
  };
  return (
    <div
      style={{
        padding: 20,
        background: "var(--bg-elev-1)",
        border: "1px solid var(--border-subtle)",
        borderRadius: "var(--r-lg)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 14,
        }}
      >
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            background:
              "linear-gradient(135deg, var(--brand-400), var(--brand-600))",
            display: "grid",
            placeItems: "center",
            color: "#0a0a0a",
            flexShrink: 0,
          }}
        >
          <IconSparkle />
        </div>
        <div>
          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: "var(--text-strong)",
            }}
          >
            바로 질문하기
          </div>
          <div
            style={{
              fontSize: 12,
              color: "var(--text-muted)",
              marginTop: 2,
            }}
          >
            자연어로 DB를 조회하세요
          </div>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 12px",
          background: "var(--bg)",
          border: "1px solid var(--border)",
          borderRadius: "var(--r-md)",
          color: "var(--text-faint)",
        }}
      >
        <IconSearch />
        <input
          value={v}
          onChange={(e) => setV(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
          placeholder="예: L3 용접라인 이번주 불량률 원인 분석"
          style={{
            flex: 1,
            background: "transparent",
            border: "none",
            outline: "none",
            fontSize: 13,
            color: "var(--text-strong)",
          }}
        />
        <span className="kbd">↵</span>
      </div>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 6,
          marginTop: 12,
        }}
      >
        {SUGGESTED_QUERIES.map((s, i) => (
          <button
            key={i}
            onClick={() => onAsk(s.text)}
            className="focus-ring"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "5px 10px",
              background: "var(--bg-elev-2)",
              border: "1px solid var(--border-subtle)",
              borderRadius: 999,
              fontSize: 11,
              color: "var(--text-muted)",
              transition: "all 120ms",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor =
                "color-mix(in oklch, var(--brand-500) 40%, transparent)";
              e.currentTarget.style.color = "var(--brand-500)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "var(--border-subtle)";
              e.currentTarget.style.color = "var(--text-muted)";
            }}
          >
            <span className="mono" style={{ color: "var(--brand-500)" }}>
              {s.icon}
            </span>
            <span>{s.text}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// RecentConversationCard
// ---------------------------------------------------------------------------

function vizIconFor(hint: VizHint | undefined) {
  switch (hint) {
    case "bar_chart":
      return <IconBar />;
    case "line_chart":
      return <IconLine />;
    case "pie_chart":
      return <IconPie />;
    case "table":
      return <IconTable />;
    case "number":
      return <IconHash />;
    default:
      return <IconSparkle />;
  }
}

function RecentConversationCard({
  c,
  onOpen,
}: {
  c: Conversation;
  onOpen: () => void;
}) {
  const last = c.messages[c.messages.length - 1];
  const preview = (last?.content ?? "")
    .replace(/<think>[\s\S]*?<\/think>/g, "")
    .replace(/\*\*|__/g, "")
    .split("\n")[0]
    .trim();

  return (
    <button
      onClick={onOpen}
      className="focus-ring"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        padding: 16,
        textAlign: "left",
        width: "100%",
        background: "var(--bg-elev-1)",
        border: "1px solid var(--border-subtle)",
        borderRadius: "var(--r-lg)",
        transition: "background 140ms, border-color 140ms",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "var(--border)";
        e.currentTarget.style.background = "var(--bg-elev-2)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "var(--border-subtle)";
        e.currentTarget.style.background = "var(--bg-elev-1)";
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, width: "100%" }}>
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: 6,
            background: "color-mix(in oklch, var(--brand-500) 14%, transparent)",
            color: "var(--brand-500)",
            display: "grid",
            placeItems: "center",
            flexShrink: 0,
          }}
        >
          {vizIconFor(last?.vizHint as VizHint | undefined)}
        </div>
        <span
          className="mono"
          style={{
            fontSize: 10,
            color: "var(--text-faint)",
            marginLeft: "auto",
          }}
        >
          {fmtRel(c.updatedAt)}
        </span>
      </div>
      <div
        style={{
          fontSize: 13,
          fontWeight: 500,
          color: "var(--text-strong)",
          lineHeight: 1.35,
        }}
      >
        {c.title}
      </div>
      {preview && (
        <div
          style={{
            fontSize: 12,
            color: "var(--text-muted)",
            lineHeight: 1.45,
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {preview}
        </div>
      )}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: 11,
          color: "var(--text-faint)",
          marginTop: "auto",
        }}
      >
        <span>{c.domainLabel}</span>
        <span>·</span>
        <span className="mono">
          {Math.max(1, Math.ceil(c.messages.length / 2))}턴
        </span>
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

interface DashboardPageProps {
  onNavigate: (page: Page) => void;
  onAskQuery?: (query: string) => void;
}

export default function DashboardPage({
  onNavigate,
  onAskQuery,
}: DashboardPageProps) {
  const [domainCount, setDomainCount] = useState<number | null>(null);
  const [tableCount, setTableCount] = useState<number>(0);
  const { conversations } = useConversationStore();

  useEffect(() => {
    fetch("/api/domains")
      .then((r) => r.json())
      .then((data: { table_count: number }[]) => {
        setDomainCount(data.length);
        setTableCount(data.reduce((s, d) => s + d.table_count, 0));
      })
      .catch(() => {});
  }, []);

  const recentConvs = useMemo(
    () =>
      [...conversations]
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, 4),
    [conversations],
  );

  const STATS = [
    { label: "연결된 DB", value: "1", sub: "MSSQL" },
    {
      label: "등록 도메인",
      value: domainCount !== null ? String(domainCount) : "—",
      sub: tableCount > 0 ? `${tableCount} tables` : "로딩 중",
    },
    {
      label: "저장된 대화",
      value: String(conversations.length),
      sub: "세션 기준",
    },
    { label: "평균 응답", value: "—", sub: "ms" },
  ];

  const handleAsk = (q: string) => {
    if (onAskQuery) {
      onAskQuery(q);
    } else {
      onNavigate("agent-chat");
    }
  };

  const today = new Date();

  return (
    <div className="fade-in" style={{ height: "100%", overflow: "auto" }}>
      <div
        style={{
          maxWidth: 1320,
          margin: "0 auto",
          padding: "28px 32px 48px",
        }}
      >
        {/* Greeting */}
        <div style={{ marginBottom: 24 }}>
          <div
            className="mono"
            style={{
              fontSize: 10,
              color: "var(--text-faint)",
              textTransform: "uppercase",
              letterSpacing: "0.12em",
              marginBottom: 6,
            }}
          >
            {formatDate(today)}
          </div>
          <h1
            style={{
              margin: 0,
              fontSize: 26,
              fontWeight: 600,
              color: "var(--text-strong)",
              letterSpacing: "-0.02em",
            }}
          >
            LossZero Intelligence{" "}
            <span style={{ color: "var(--text-faint)", fontWeight: 400 }}>
              — 제조 ERP 데이터 AI 분석 플랫폼
            </span>
          </h1>
        </div>

        {/* Stats row */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: 12,
            marginBottom: 20,
          }}
        >
          {STATS.map((stat, i) => (
            <div
              key={stat.label}
              style={{
                padding: "18px 20px",
                background: "var(--bg-elev-1)",
                border: "1px solid var(--border-subtle)",
                borderRadius: "var(--r-lg)",
                position: "relative",
                overflow: "hidden",
              }}
            >
              {i === 0 && (
                <div
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    height: 2,
                    background:
                      "linear-gradient(90deg, var(--brand-400), var(--brand-600))",
                  }}
                />
              )}
              <div
                style={{
                  fontSize: 12,
                  color: "var(--text-muted)",
                  fontWeight: 500,
                  marginBottom: 10,
                }}
              >
                {stat.label}
              </div>
              <div
                className="mono tnum"
                style={{
                  fontSize: 28,
                  fontWeight: 600,
                  lineHeight: 1,
                  color:
                    i === 0 ? "var(--brand-500)" : "var(--text-strong)",
                  letterSpacing: "-0.02em",
                }}
              >
                {stat.value}
              </div>
              <div
                style={{
                  marginTop: 6,
                  fontSize: 11,
                  color: "var(--text-faint)",
                }}
              >
                {stat.sub}
              </div>
            </div>
          ))}
        </div>

        {/* QuickAsk (full width when no recent, or left-side) */}
        <div style={{ marginBottom: 28 }}>
          <QuickAsk onAsk={handleAsk} />
        </div>

        {/* Recent conversations */}
        {recentConvs.length > 0 && (
          <div style={{ marginBottom: 28 }}>
            <div
              style={{
                display: "flex",
                alignItems: "flex-end",
                justifyContent: "space-between",
                marginBottom: 12,
              }}
            >
              <div>
                <div
                  className="mono"
                  style={{
                    fontSize: 10,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    color: "var(--text-faint)",
                    marginBottom: 4,
                  }}
                >
                  Recent
                </div>
                <h2
                  style={{
                    margin: 0,
                    fontSize: 15,
                    fontWeight: 600,
                    color: "var(--text-strong)",
                  }}
                >
                  최근 대화
                </h2>
              </div>
              <button
                onClick={() => onNavigate("agent-chat")}
                className="focus-ring"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  fontSize: 12,
                  color: "var(--text-muted)",
                  padding: "4px 8px",
                  borderRadius: 6,
                  transition: "color 120ms",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = "var(--brand-500)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = "var(--text-muted)";
                }}
              >
                전체보기 <IconArrowR />
              </button>
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
                gap: 12,
              }}
            >
              {recentConvs.map((c) => (
                <RecentConversationCard
                  key={c.id}
                  c={c}
                  onOpen={() => onNavigate("agent-chat")}
                />
              ))}
            </div>
          </div>
        )}

        {/* Module cards */}
        <div
          className="mono"
          style={{
            fontSize: 10,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: "var(--text-faint)",
            marginBottom: 4,
          }}
        >
          Menu
        </div>
        <h2
          style={{
            margin: "0 0 16px",
            fontSize: 15,
            fontWeight: 600,
            color: "var(--text-strong)",
          }}
        >
          메뉴
        </h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: 16,
          }}
        >
          {MODULES.map((mod) => (
            <div
              key={mod.title}
              className={`relative flex flex-col rounded-xl border border-border-subtle bg-gradient-to-br ${mod.color} p-5 cursor-pointer group transition-all hover:border-border`}
              onClick={() => onNavigate(mod.id)}
            >
              <div className="mb-4 w-fit rounded-lg bg-bg-elev-1 p-2.5">
                <span className="text-text-muted">{mod.icon}</span>
              </div>
              <h3 className="mb-1.5 text-base font-semibold text-text-strong">
                {mod.title}
              </h3>
              <p className="mb-4 flex-1 text-sm text-text-muted leading-relaxed">
                {mod.description}
              </p>
              <div className="mb-4 flex flex-wrap gap-1.5">
                {mod.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded bg-bg-elev-2 px-2 py-0.5 text-[10px] text-text-dim"
                  >
                    {tag}
                  </span>
                ))}
              </div>
              <button className="w-full rounded-lg bg-bg-elev-2 py-2 text-sm font-medium text-text-base transition hover:bg-bg-elev-3 hover:text-text-strong">
                시작하기 →
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
