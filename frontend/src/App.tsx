import { useState } from "react";
import AppShell, { type Page } from "./components/AppShell";
import DashboardPage from "./pages/DashboardPage";
import DataQueryPage from "./pages/DataQueryPage";
import AgentChatPage from "./pages/AgentChatPage";
import UIBuilderPage from "./pages/UIBuilderPage";

export default function App() {
  const [currentPage, setCurrentPage] = useState<Page>("dashboard");

  return (
    <AppShell currentPage={currentPage} onNavigate={setCurrentPage}>
      {/* Keep all pages mounted, toggle visibility with CSS */}
      <div className={currentPage === "dashboard" ? "h-full" : "hidden"}>
        <DashboardPage onNavigate={setCurrentPage} />
      </div>
      <div className={currentPage === "data-query" ? "h-full" : "hidden"}>
        <DataQueryPage />
      </div>
      <div className={currentPage === "agent-chat" ? "h-full" : "hidden"}>
        <AgentChatPage />
      </div>
      <div className={currentPage === "ui-builder" ? "h-full" : "hidden"}>
        <UIBuilderPage />
      </div>
    </AppShell>
  );
}
