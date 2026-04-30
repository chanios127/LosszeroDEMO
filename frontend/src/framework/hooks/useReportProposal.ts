import { useCallback, useEffect, useRef, useState } from "react";
import type { ReportProposedEvent } from "../../design/types/events";

const API_BASE = "/api";

interface UseReportProposalOptions {
  streamKey: string | null;
  onArchived?: () => void;
}

export function useReportProposal({
  streamKey,
  onArchived,
}: UseReportProposalOptions) {
  const [proposal, setProposal] = useState<ReportProposedEvent | null>(null);
  const [pending, setPending] = useState(false);
  const proposalRef = useRef<ReportProposedEvent | null>(null);
  const esRef = useRef<EventSource | null>(null);

  // Keep ref in sync so archive/discard callbacks always see latest proposal
  useEffect(() => {
    proposalRef.current = proposal;
  }, [proposal]);

  // Open a second EventSource on the same stream key so we can intercept
  // report_proposed events without touching useAgentStream internals.
  // Backend replays all buffered events on every new connection, so late
  // attachment still picks up the event even if it fired before this effect ran.
  useEffect(() => {
    esRef.current?.close();
    esRef.current = null;
    setProposal(null);
    if (!streamKey) return;

    const es = new EventSource(`${API_BASE}/stream/${streamKey}`);
    esRef.current = es;

    const handleProposed = (e: MessageEvent) => {
      try {
        const event: ReportProposedEvent = JSON.parse(e.data);
        setProposal((prev) => {
          // Auto-discard a superseded proposal silently
          if (prev && prev.id_temp !== event.id_temp) {
            fetch(`${API_BASE}/reports/proposal/${prev.id_temp}`, {
              method: "DELETE",
            }).catch(() => {});
          }
          return event;
        });
      } catch { /* skip malformed */ }
    };

    const handleStreamEnd = () => { es.close(); };

    es.addEventListener("report_proposed", handleProposed);
    es.addEventListener("final", handleStreamEnd);
    es.addEventListener("error", handleStreamEnd);
    es.onerror = () => { es.close(); };

    return () => { es.close(); };
  }, [streamKey]);

  const archive = useCallback(
    async (edits?: { title?: string; tags?: string[] }) => {
      const p = proposalRef.current;
      if (!p) return;
      setPending(true);
      try {
        const res = await fetch(`${API_BASE}/reports/confirm/${p.id_temp}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: edits?.title, tags: edits?.tags }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setProposal(null);
        onArchived?.();
      } catch (err) {
        console.error("useReportProposal.archive failed:", err);
      } finally {
        setPending(false);
      }
    },
    [onArchived],
  );

  const discard = useCallback(async () => {
    const p = proposalRef.current;
    if (!p) return;
    setPending(true);
    try {
      await fetch(`${API_BASE}/reports/proposal/${p.id_temp}`, {
        method: "DELETE",
      });
    } catch { /* non-fatal */ } finally {
      setProposal(null);
      setPending(false);
    }
  }, []);

  return { proposal, pending, archive, discard };
}
