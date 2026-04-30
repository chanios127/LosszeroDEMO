import { useCallback, useEffect, useMemo, useState } from "react";

/**
 * Per-domain quick-prompt presets. label / prompt 분리 — 버튼 표시는 label,
 * 클릭 시 LLM 전송은 prompt. localStorage 영속화 (key v1).
 *
 * CRUD UI는 후속 사이클. 본 hook은 데이터 shape + 영속화만.
 */

export interface QuickPrompt {
  id: string;
  label: string;
  prompt: string;
}

const STORAGE_KEY = "losszero.quick-prompts.v1";

const DEFAULTS: Record<string, QuickPrompt[]> = {
  groupware: [
    {
      id: "gw-attendance-gantt",
      label: "출근 현황 조회",
      prompt: "오늘 직원별 출근 현황을 간트차트로 만들어줘.",
    },
    {
      id: "gw-as-requests",
      label: "거래처별 AS 요청 현황",
      prompt:
        "거래처별 AS 요청 현안이 궁금한데. 최근 한달 기준. 상담내역과 요청현안 모두 조회해서 업체별로 요청 건수, 요청 유형 등을 분석해줘.",
    },
    {
      id: "gw-employee-tasks",
      label: "직원별 업무 현황",
      prompt:
        "최근 한달 기준 직원 업무일지를 분석해 직원별로 어떤 유형의 업무를 처리했는지 보고서 만들어줘.",
    },
  ],
};

type AllStore = Record<string, QuickPrompt[]>;

function readAll(): AllStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as AllStore;
  } catch {
    // ignore
  }
  return {};
}

function writeAll(data: AllStore) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // ignore
  }
}

function deriveFallback(
  domainCode: string,
  fallbackKeywords: string[],
): QuickPrompt[] {
  if (DEFAULTS[domainCode]) return DEFAULTS[domainCode];
  return fallbackKeywords.slice(0, 3).map((kw, i) => ({
    id: `${domainCode}-kw-${i}`,
    label: `${kw} 현황 조회`,
    prompt: `${kw} 현황 조회`,
  }));
}

export function useQuickPrompts(
  domainCode: string,
  fallbackKeywords: string[],
) {
  const fallback = useMemo(
    () => deriveFallback(domainCode, fallbackKeywords),
    [domainCode, fallbackKeywords],
  );

  const [prompts, setPrompts] = useState<QuickPrompt[]>(() => {
    const all = readAll();
    return all[domainCode] ?? fallback;
  });

  // Re-seed when domain switches (within same session, e.g. user picks another agent)
  useEffect(() => {
    const all = readAll();
    setPrompts(all[domainCode] ?? fallback);
  }, [domainCode, fallback]);

  // Persist on change
  useEffect(() => {
    const all = readAll();
    all[domainCode] = prompts;
    writeAll(all);
  }, [domainCode, prompts]);

  const replaceAll = useCallback((next: QuickPrompt[]) => setPrompts(next), []);

  return { prompts, setPrompts: replaceAll };
}
