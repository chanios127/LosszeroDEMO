import { useCallback, useEffect, useRef, useState } from "react";
import type { ReportSchema } from "../../design/types/report";

export const REPORTS_CACHE_KEY = "losszero.reports.cache.v1";
const API_BASE = "/api";

export interface ReportSummary {
  id: string;
  title: string;
  created_at: string | null;
  domain: string;
  tags: string[];
}

export interface Report extends ReportSummary {
  schema: ReportSchema;
  summary: string;
  meta: Record<string, unknown>;
}

function loadCache(): ReportSummary[] {
  try {
    const raw = localStorage.getItem(REPORTS_CACHE_KEY);
    if (raw) return JSON.parse(raw) as ReportSummary[];
  } catch { /* storage disabled */ }
  return [];
}

function saveCache(list: ReportSummary[]) {
  try {
    localStorage.setItem(REPORTS_CACHE_KEY, JSON.stringify(list));
  } catch { /* storage full */ }
}

export function useReportArchive() {
  const [list, setList] = useState<ReportSummary[]>(() => loadCache());
  const [selected, setSelected] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initialLoadRef = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/reports`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: ReportSummary[] = await res.json();
      setList(data);
      saveCache(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "보고서 목록 조회 실패");
    } finally {
      setLoading(false);
    }
  }, []);

  const refresh = useCallback(() => load(), [load]);

  const select = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/reports/${id}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const report: Report = await res.json();
      setSelected(report);
    } catch (err) {
      setError(err instanceof Error ? err.message : "보고서 상세 조회 실패");
    } finally {
      setLoading(false);
    }
  }, []);

  const deleteReport = useCallback(async (id: string) => {
    try {
      const res = await fetch(`${API_BASE}/reports/${id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 404) throw new Error(`HTTP ${res.status}`);
      setList((prev) => {
        const next = prev.filter((r) => r.id !== id);
        saveCache(next);
        return next;
      });
      setSelected((prev) => (prev?.id === id ? null : prev));
    } catch (err) {
      setError(err instanceof Error ? err.message : "보고서 삭제 실패");
    }
  }, []);

  useEffect(() => {
    if (!initialLoadRef.current) {
      initialLoadRef.current = true;
      load();
    }
  }, [load]);

  return {
    list,
    selected,
    loading,
    error,
    load,
    refresh,
    select,
    deleteReport,
  };
}
