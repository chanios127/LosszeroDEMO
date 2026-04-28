import { useState, type ReactNode, type ComponentType, type SVGProps } from "react";
import {
  IconHome,
  IconSparkle,
  IconDB,
  IconLayout,
  IconChevL,
  IconChevR,
  IconSettings,
  IconPlus,
  IconMenu,
  IconClose,
} from "./icons";
import { Button, Dot, cls } from "./primitives";

export type Page = "dashboard" | "data-query" | "agent-chat" | "ui-builder";

export const PAGE_LABELS: Record<Page, string> = {
  dashboard: "대시보드",
  "data-query": "데이터 조회",
  "agent-chat": "에이전트 챗봇",
  "ui-builder": "UI 빌더",
};

interface NavItem {
  id: Page;
  label: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
}

const NAV_ITEMS: NavItem[] = [
  { id: "dashboard", label: PAGE_LABELS.dashboard, Icon: IconHome },
  { id: "data-query", label: PAGE_LABELS["data-query"], Icon: IconDB },
  { id: "agent-chat", label: PAGE_LABELS["agent-chat"], Icon: IconSparkle },
  { id: "ui-builder", label: PAGE_LABELS["ui-builder"], Icon: IconLayout },
];

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------

interface SidebarProps {
  currentPage: Page;
  onNavigate: (page: Page) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onMobileClose: () => void;
  mobileOpen: boolean;
}

function Sidebar({
  currentPage,
  onNavigate,
  collapsed,
  onToggleCollapse,
  onMobileClose,
  mobileOpen,
}: SidebarProps) {
  const width = collapsed ? 60 : 232;

  return (
    <aside
      style={{
        width,
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        background: "var(--bg-elev-1)",
        borderRight: "1px solid var(--border-subtle)",
        transition: "width 180ms ease, transform 180ms ease",
        zIndex: 30,
      }}
      className={cls(
        "max-lg:!fixed max-lg:inset-y-0 max-lg:left-0",
        mobileOpen ? "max-lg:translate-x-0" : "max-lg:-translate-x-full",
      )}
    >
      {/* Logo row */}
      <div
        style={{
          height: 56,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 14px",
          borderBottom: "1px solid var(--border-subtle)",
          flexShrink: 0,
        }}
      >
        {!collapsed && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: 26,
                height: 26,
                borderRadius: 7,
                background:
                  "linear-gradient(135deg, var(--brand-400), var(--brand-600))",
                display: "grid",
                placeItems: "center",
                color: "#0a0a0a",
                fontWeight: 700,
                fontSize: 13,
                fontFamily: "var(--font-mono)",
                letterSpacing: "-0.04em",
              }}
            >
              L0
            </div>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                lineHeight: 1.1,
              }}
            >
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: "var(--text-strong)",
                  letterSpacing: "-0.01em",
                }}
              >
                LossZero
              </span>
              <span
                className="mono"
                style={{
                  fontSize: 9,
                  color: "var(--text-faint)",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                }}
              >
                agent v0.1
              </span>
            </div>
          </div>
        )}
        <button
          onClick={mobileOpen ? onMobileClose : onToggleCollapse}
          title={
            mobileOpen ? "닫기" : collapsed ? "펼치기" : "접기"
          }
          className="focus-ring"
          style={{
            width: 28,
            height: 28,
            borderRadius: 6,
            display: "grid",
            placeItems: "center",
            color: "var(--text-faint)",
            marginLeft: "auto",
          }}
        >
          {mobileOpen ? <IconClose /> : collapsed ? <IconChevR /> : <IconChevL />}
        </button>
      </div>

      {/* Nav */}
      <nav
        style={{
          flex: 1,
          padding: "10px 8px",
          display: "flex",
          flexDirection: "column",
          gap: 2,
          overflowY: "auto",
        }}
      >
        {!collapsed && (
          <div
            className="mono"
            style={{
              padding: "4px 8px",
              fontSize: 10,
              color: "var(--text-faint)",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              marginTop: 4,
            }}
          >
            Workspace
          </div>
        )}
        {NAV_ITEMS.map((item) => {
          const active = currentPage === item.id;
          return (
            <button
              key={item.id}
              onClick={() => {
                onNavigate(item.id);
                onMobileClose();
              }}
              title={collapsed ? item.label : undefined}
              className="focus-ring"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: collapsed ? "9px 0" : "9px 10px",
                justifyContent: collapsed ? "center" : "flex-start",
                borderRadius: 8,
                fontSize: 13,
                color: active ? "var(--brand-500)" : "var(--text-muted)",
                background: active
                  ? "color-mix(in oklch, var(--brand-500) 12%, transparent)"
                  : "transparent",
                transition: "background 120ms, color 120ms",
              }}
              onMouseEnter={(e) => {
                if (!active) {
                  e.currentTarget.style.background = "var(--bg-elev-2)";
                  e.currentTarget.style.color = "var(--text-strong)";
                }
              }}
              onMouseLeave={(e) => {
                if (!active) {
                  e.currentTarget.style.background = "transparent";
                  e.currentTarget.style.color = "var(--text-muted)";
                }
              }}
            >
              <item.Icon />
              {!collapsed && <span>{item.label}</span>}
            </button>
          );
        })}
      </nav>

      {/* Footer: user */}
      <div
        style={{
          padding: 10,
          borderTop: "1px solid var(--border-subtle)",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "8px 8px",
            borderRadius: 8,
          }}
        >
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 999,
              background:
                "linear-gradient(135deg, var(--chart-default-3), var(--chart-default-4))",
              color: "#0a0a0a",
              fontWeight: 600,
              fontSize: 11,
              display: "grid",
              placeItems: "center",
              flexShrink: 0,
            }}
          >
            PJW
          </div>
          {!collapsed && (
            <div style={{ minWidth: 0, flex: 1 }}>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 500,
                  color: "var(--text-strong)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                박정우
              </div>
              <div
                className="mono"
                style={{ fontSize: 10, color: "var(--text-faint)" }}
              >
                연구개발팀
              </div>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

interface HeaderProps {
  currentPage: Page;
  onOpenTweaks?: () => void;
  onNewChat?: () => void;
  onMobileMenu: () => void;
}

function Header({
  currentPage,
  onOpenTweaks,
  onNewChat,
  onMobileMenu,
}: HeaderProps) {
  return (
    <header
      style={{
        height: 56,
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 20px",
        borderBottom: "1px solid var(--border-subtle)",
        background: "var(--bg)",
        gap: 12,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 13,
          minWidth: 0,
        }}
      >
        <button
          onClick={onMobileMenu}
          className="focus-ring lg:!hidden"
          title="메뉴"
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            display: "grid",
            placeItems: "center",
            color: "var(--text-muted)",
          }}
        >
          <IconMenu />
        </button>
        <span style={{ color: "var(--text-faint)" }}>LossZero</span>
        <span style={{ color: "var(--text-faint)" }}>/</span>
        <span
          style={{
            color: "var(--text-strong)",
            fontWeight: 500,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {PAGE_LABELS[currentPage]}
        </span>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "5px 10px",
            background: "var(--bg-elev-1)",
            border: "1px solid var(--border-subtle)",
            borderRadius: 999,
            fontSize: 11,
            color: "var(--text-muted)",
          }}
        >
          <Dot tone="success" pulse />
          <span className="mono">MSSQL</span>
          <span style={{ color: "var(--text-faint)" }}>·</span>
          <span className="mono">prod_qa</span>
        </div>

        {currentPage === "agent-chat" && onNewChat && (
          <Button variant="primary" size="sm" onClick={onNewChat}>
            <IconPlus />
            <span>새 대화</span>
          </Button>
        )}

        {onOpenTweaks && (
          <button
            onClick={onOpenTweaks}
            className="focus-ring"
            title="Tweaks"
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              display: "grid",
              placeItems: "center",
              color: "var(--text-muted)",
              border: "1px solid var(--border-subtle)",
              background: "var(--bg-elev-1)",
            }}
          >
            <IconSettings />
          </button>
        )}
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------
// AppShell
// ---------------------------------------------------------------------------

interface AppShellProps {
  currentPage: Page;
  onNavigate: (page: Page) => void;
  children: ReactNode;
  onOpenTweaks?: () => void;
  onNewChat?: () => void;
}

export default function AppShell({
  currentPage,
  onNavigate,
  children,
  onOpenTweaks,
  onNewChat,
}: AppShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        overflow: "hidden",
        background: "var(--bg)",
        position: "relative",
      }}
    >
      {mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          className="lg:hidden"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 20,
            background: "rgb(0 0 0 / 0.6)",
          }}
        />
      )}
      <Sidebar
        currentPage={currentPage}
        onNavigate={onNavigate}
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((v) => !v)}
        onMobileClose={() => setMobileOpen(false)}
        mobileOpen={mobileOpen}
      />
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          minWidth: 0,
        }}
      >
        <Header
          currentPage={currentPage}
          onOpenTweaks={onOpenTweaks}
          onNewChat={onNewChat}
          onMobileMenu={() => setMobileOpen(true)}
        />
        <main style={{ flex: 1, overflow: "hidden" }}>{children}</main>
      </div>
    </div>
  );
}
