import { useState } from "react";
import AppShell, { type Page } from "./components/AppShell";
import DashboardPage from "./pages/DashboardPage";
import DataQueryPage from "./pages/DataQueryPage";
import AgentChatPage from "./pages/AgentChatPage";

export default function App() {
  const [currentPage, setCurrentPage] = useState<Page>("dashboard");

  return (
    <AppShell currentPage={currentPage} onNavigate={setCurrentPage}>
      {currentPage === "dashboard" && (
        <DashboardPage onNavigate={setCurrentPage} />
      )}
      {currentPage === "data-query" && <DataQueryPage />}
      {currentPage === "agent-chat" && <AgentChatPage />}
    </AppShell>
  );
}
