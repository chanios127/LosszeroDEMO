import { useState } from "react";

export type Page = "dashboard" | "data-query" | "agent-chat";

export const PAGE_LABELS: Record<Page, string> = {
  dashboard: "대시보드",
  "data-query": "데이터 조회",
  "agent-chat": "에이전트 챗봇",
};

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------
function IconGrid() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
    </svg>
  );
}

function IconDatabase() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
      <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
    </svg>
  );
}

function IconBot() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="10" rx="2" />
      <circle cx="12" cy="5" r="2" />
      <path d="M12 7v4" />
      <line x1="8" y1="16" x2="8" y2="16" strokeWidth="3" strokeLinecap="round" />
      <line x1="12" y1="16" x2="12" y2="16" strokeWidth="3" strokeLinecap="round" />
      <line x1="16" y1="16" x2="16" y2="16" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function IconChevronLeft() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

function IconChevronRight() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function IconMenu() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}

function IconX() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Nav items
// ---------------------------------------------------------------------------
interface NavItem {
  id: Page;
  label: string;
  icon: React.ReactNode;
}

const NAV_ITEMS: NavItem[] = [
  { id: "dashboard", label: "대시보드", icon: <IconGrid /> },
  { id: "data-query", label: "데이터 조회", icon: <IconDatabase /> },
  { id: "agent-chat", label: "에이전트 챗봇", icon: <IconBot /> },
];

// ---------------------------------------------------------------------------
// AppShell
// ---------------------------------------------------------------------------
interface AppShellProps {
  currentPage: Page;
  onNavigate: (page: Page) => void;
  children: React.ReactNode;
}

export default function AppShell({ currentPage, onNavigate, children }: AppShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleNavigate = (page: Page) => {
    onNavigate(page);
    setMobileOpen(false);
  };

  return (
    <div className="flex h-screen overflow-hidden bg-slate-950">
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/60 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed lg:relative z-30 flex flex-col h-full
          bg-slate-900 border-r border-slate-800
          transition-all duration-200 shrink-0
          ${collapsed ? "lg:w-14" : "lg:w-52"}
          ${mobileOpen ? "w-52 translate-x-0" : "w-52 -translate-x-full lg:translate-x-0"}
        `}
      >
        {/* Logo row */}
        <div className="flex h-14 items-center justify-between px-3 border-b border-slate-800 shrink-0">
          {!collapsed && (
            <div className="flex items-center gap-2 overflow-hidden">
              <span className="text-sm font-bold text-slate-100 whitespace-nowrap">LossZero</span>
              <span className="rounded bg-brand-500/20 px-1.5 py-0.5 text-[10px] font-medium text-brand-500 whitespace-nowrap">
                AI
              </span>
            </div>
          )}
          {/* Desktop collapse toggle */}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="hidden lg:flex shrink-0 items-center justify-center w-8 h-8 rounded
              hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors ml-auto"
            title={collapsed ? "펼치기" : "접기"}
          >
            {collapsed ? <IconChevronRight /> : <IconChevronLeft />}
          </button>
          {/* Mobile close */}
          <button
            onClick={() => setMobileOpen(false)}
            className="lg:hidden flex items-center justify-center w-8 h-8 rounded
              hover:bg-slate-800 text-slate-400 hover:text-slate-200 ml-auto"
          >
            <IconX />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {NAV_ITEMS.map((item) => {
            const isActive = currentPage === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleNavigate(item.id)}
                title={collapsed ? item.label : undefined}
                className={`
                  w-full flex items-center gap-3 rounded-lg px-2 py-2.5 text-sm
                  transition-colors
                  ${collapsed ? "justify-center" : ""}
                  ${isActive
                    ? "bg-brand-500/15 text-brand-500"
                    : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                  }
                `}
              >
                <span className="shrink-0">{item.icon}</span>
                {!collapsed && <span className="whitespace-nowrap">{item.label}</span>}
              </button>
            );
          })}
        </nav>

        {/* Footer */}
        {!collapsed && (
          <div className="shrink-0 px-3 py-3 border-t border-slate-800">
            <p className="text-[10px] text-slate-600">LLM Harness PoC v0.1</p>
          </div>
        )}
      </aside>

      {/* Main area */}
      <div className="flex flex-1 flex-col overflow-hidden min-w-0">
        {/* Top header */}
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-800 px-4 gap-4">
          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileOpen(true)}
            className="lg:hidden flex items-center justify-center w-8 h-8 rounded
              hover:bg-slate-800 text-slate-400 hover:text-slate-200"
          >
            <IconMenu />
          </button>

          {/* Breadcrumb */}
          <div className="flex items-center gap-1.5 text-sm min-w-0">
            <span className="text-slate-600 hidden sm:block">LossZero</span>
            <span className="text-slate-700 hidden sm:block">/</span>
            <span className="text-slate-300 font-medium truncate">
              {PAGE_LABELS[currentPage]}
            </span>
          </div>

          {/* Status indicator */}
          <div className="flex items-center gap-2 shrink-0">
            <span className="hidden sm:block text-xs text-slate-600">MSSQL 연결됨</span>
            <span className="h-2 w-2 rounded-full bg-green-500 shrink-0" title="DB 연결 정상" />
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-hidden">
          {children}
        </main>
      </div>
    </div>
  );
}
