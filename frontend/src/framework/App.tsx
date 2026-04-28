import { useState } from "react";
import AppShell, { type Page } from "../design/components/AppShell";
import TweaksPanel from "../design/components/TweaksPanel";
import DashboardPage from "./pages/DashboardPage";
import DataQueryPage from "./pages/DataQueryPage";
import AgentChatPage from "./pages/AgentChatPage";
import UIBuilderPage from "./pages/UIBuilderPage";
import { useTweaks } from "./hooks/useTweaks";

export default function App() {
  const [currentPage, setCurrentPage] = useState<Page>("dashboard");
  const [pendingQuery, setPendingQuery] = useState<string | null>(null);
  const { tweaks, setTweak, showTweaks, setShowTweaks } = useTweaks();

  const handleAskFromDashboard = (query: string) => {
    setPendingQuery(query);
    setCurrentPage("agent-chat");
  };

  return (
    <>
      <AppShell
        currentPage={currentPage}
        onNavigate={setCurrentPage}
        onOpenTweaks={() => setShowTweaks((v) => !v)}
      >
        {/* Keep all pages mounted, toggle visibility with CSS */}
        <div className={currentPage === "dashboard" ? "h-full" : "hidden"}>
          <DashboardPage
            onNavigate={setCurrentPage}
            onAskQuery={handleAskFromDashboard}
          />
        </div>
        <div className={currentPage === "data-query" ? "h-full" : "hidden"}>
          <DataQueryPage />
        </div>
        <div className={currentPage === "agent-chat" ? "h-full" : "hidden"}>
          <AgentChatPage
            pendingQuery={pendingQuery}
            onClearPendingQuery={() => setPendingQuery(null)}
          />
        </div>
        <div className={currentPage === "ui-builder" ? "h-full" : "hidden"}>
          <UIBuilderPage />
        </div>
      </AppShell>
      {showTweaks && (
        <TweaksPanel
          tweaks={tweaks}
          setTweak={setTweak}
          onClose={() => setShowTweaks(false)}
        />
      )}
    </>
  );
}
