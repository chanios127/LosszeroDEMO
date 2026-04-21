import { useEffect, useState } from "react";
import type { Page } from "../components/AppShell";

interface Module {
  id: Page;
  title: string;
  description: string;
  tags: string[];
  icon: React.ReactNode;
  status: "active" | "soon";
  color: string;
}

function IconDatabase() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
      <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
    </svg>
  );
}

function IconBot() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="10" rx="2" />
      <circle cx="12" cy="5" r="2" />
      <path d="M12 7v4" />
      <line x1="8" y1="16" x2="8" y2="16" strokeWidth="3" strokeLinecap="round" />
      <line x1="12" y1="16" x2="12" y2="16" strokeWidth="3" strokeLinecap="round" />
      <line x1="16" y1="16" x2="16" y2="16" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function IconChart() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
      <line x1="2" y1="20" x2="22" y2="20" />
    </svg>
  );
}

const MODULES: Module[] = [
  {
    id: "data-query",
    title: "데이터 조회",
    description:
      "자연어로 ERP 데이터베이스를 조회하고 결과를 차트·테이블로 즉시 시각화합니다.",
    tags: ["SQL 자동 생성", "실시간 시각화", "결과 히스토리"],
    icon: <IconDatabase />,
    status: "active",
    color: "from-brand-500/20 to-cyan-500/10",
  },
  {
    id: "agent-chat",
    title: "에이전트 챗봇",
    description:
      "도메인 특화 AI 에이전트와 심층 분석 대화를 나눕니다. 생산·재고·품질 전문 에이전트를 선택하세요.",
    tags: ["도메인 특화", "다중 에이전트", "멀티턴 대화"],
    icon: <IconBot />,
    status: "active",
    color: "from-violet-500/20 to-purple-500/10",
  },
  {
    id: "ui-builder",
    title: "UI 빌더",
    description: "데이터를 수집하고 LLM이 제안하는 시각화로 대시보드 위젯을 조립합니다.",
    tags: ["자연어 → SQL", "AI 차트 제안", "위젯 조립"],
    icon: <IconChart />,
    status: "active",
    color: "from-amber-500/20 to-orange-500/10",
  },
];

interface DashboardPageProps {
  onNavigate: (page: Page) => void;
}

export default function DashboardPage({ onNavigate }: DashboardPageProps) {
  const [domainCount, setDomainCount] = useState<number | null>(null);
  const [tableCount, setTableCount] = useState<number>(0);

  useEffect(() => {
    fetch("/api/domains")
      .then((r) => r.json())
      .then((data: { table_count: number }[]) => {
        setDomainCount(data.length);
        setTableCount(data.reduce((s, d) => s + d.table_count, 0));
      })
      .catch(() => {});
  }, []);

  const STATS = [
    { label: "연결된 DB", value: "1", sub: "MSSQL" },
    {
      label: "등록 도메인",
      value: domainCount !== null ? String(domainCount) : "—",
      sub: tableCount > 0 ? `${tableCount} tables` : "로딩 중",
    },
    { label: "오늘 처리된 쿼리", value: "—", sub: "세션 기준" },
    { label: "평균 응답", value: "—", sub: "ms" },
  ];

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-5xl px-6 py-10">
        {/* Hero */}
        <div className="mb-10">
          <h1 className="text-2xl font-bold text-slate-100">
            LossZero Intelligence
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            제조 ERP 데이터 AI 분석 플랫폼 — 메뉴를 선택해 시작하세요.
          </p>
        </div>

        {/* Stats row */}
        <div className="mb-10 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {STATS.map((stat) => (
            <div
              key={stat.label}
              className="rounded-lg border border-slate-800 bg-slate-900 px-4 py-4"
            >
              <p className="text-xl font-bold text-slate-100">{stat.value}</p>
              <p className="mt-0.5 text-xs font-medium text-slate-400">
                {stat.label}
              </p>
              <p className="text-[10px] text-slate-600">{stat.sub}</p>
            </div>
          ))}
        </div>

        {/* Module cards */}
        <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-slate-500">
          메뉴
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {MODULES.map((mod) => (
            <div
              key={mod.title}
              className={`relative flex flex-col rounded-xl border border-slate-800 bg-gradient-to-br ${mod.color} p-5 transition-all
                ${mod.status === "active" ? "hover:border-slate-700 cursor-pointer group" : "opacity-60"}`}
              onClick={mod.status === "active" ? () => onNavigate(mod.id) : undefined}
            >
              {mod.status === "soon" && (
                <span className="absolute right-3 top-3 rounded bg-slate-800 px-2 py-0.5 text-[10px] font-medium text-slate-400">
                  준비 중
                </span>
              )}

              <div className={`mb-4 w-fit rounded-lg bg-slate-900/60 p-2.5 transition-colors
                ${mod.status === "active" ? "group-hover:bg-slate-900" : ""}`}>
                <span className="text-slate-400">{mod.icon}</span>
              </div>

              <h3 className="mb-1.5 text-base font-semibold text-slate-100">
                {mod.title}
              </h3>
              <p className="mb-4 flex-1 text-sm text-slate-400 leading-relaxed">
                {mod.description}
              </p>

              <div className="mb-4 flex flex-wrap gap-1.5">
                {mod.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded bg-slate-800/80 px-2 py-0.5 text-[10px] text-slate-500"
                  >
                    {tag}
                  </span>
                ))}
              </div>

              {mod.status === "active" && (
                <button
                  onClick={() => onNavigate(mod.id)}
                  className="w-full rounded-lg bg-slate-800 py-2 text-sm font-medium
                    text-slate-300 transition hover:bg-slate-700 hover:text-slate-100"
                >
                  시작하기 →
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
