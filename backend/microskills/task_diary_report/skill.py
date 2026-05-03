"""Skill 2 — 업무일지 보고서.

Trigger: 룰 (업무일지/일지/다이어리).
Params:
  - period_start, period_end (룰 파싱 — 이번주/지난달/최근 N일/특정 날짜 범위)
  - keywords (LLM 추출 — 사용자 발화에서 preset matched terms)
LLM 호출: 1회 (keyword extract, optional 결론 markdown).
SP: sp_task_diary_summary(@start, @end, @keywords_csv) → multi-resultset.
Template: kpi_grid + bubble (키워드 클러스터) + ranked (Top 작성자) + markdown 결론.
"""
from __future__ import annotations

import json
import logging
import re
from datetime import date as date_cls
from datetime import timedelta
from typing import Any

from llm.base import LLMEventType, LLMProvider, Message
from microskills._helpers import call_sp, parse_period
from microskills.base import MicroskillBase, MicroskillMatch, MicroskillResult

logger = logging.getLogger(__name__)

_TRIGGERS = re.compile(r"(업무일지|일지|업무\s*보고|다이어리)")

# Preset keyword universe — SP 내부에서 LIKE 기반 카운트
DIARY_PRESET_KEYWORDS = [
    "재고", "생산", "키오스크", "BOM", "품질", "원가", "급여",
    "검사", "오류", "전표", "회계", "프로젝트", "휴가",
]


class TaskDiaryReportSkill(MicroskillBase):
    name = "task_diary_report"
    domain = "groupware"
    description = "업무일지 보고서 — 기간 + 키워드(LLM 추출) → SP → 고정 템플릿"

    def detect(self, query: str, session_domain: str) -> MicroskillMatch:
        if not _TRIGGERS.search(query):
            return MicroskillMatch(matched=False)
        period = parse_period(query) or self._default_period()
        return MicroskillMatch(
            matched=True,
            params={
                "period_start": period[0].isoformat(),
                "period_end": period[1].isoformat(),
            },
            confidence=0.85,
            needs_llm_extract=True,
        )

    def _default_period(self) -> tuple[date_cls, date_cls]:
        # 기본: 지난 7일
        today = date_cls.today()
        return (today - timedelta(days=6), today)

    async def _extract_keywords(
        self,
        query: str,
        llm: LLMProvider | None,
    ) -> list[str]:
        """LLM-light 키워드 추출. preset에 매칭되는 토큰만 채택."""
        # 우선 룰베이스 — 사용자 발화에 preset 단어가 그대로 있으면 LLM 미사용
        rule_hits = [k for k in DIARY_PRESET_KEYWORDS if k in query]
        if rule_hits or not llm:
            return rule_hits

        sys = (
            "다음 사용자 질의에서 업무 키워드를 추출. "
            f"허용 목록(이 외는 무시): {', '.join(DIARY_PRESET_KEYWORDS)}. "
            "JSON 한 줄로 답변: {\"keywords\": [\"...\"]}"
        )
        msgs: list[Message] = [
            {"role": "system", "content": sys},
            {"role": "user", "content": query},
        ]
        text_parts: list[str] = []
        try:
            async for ev in llm.complete(msgs, [], max_tokens=200):
                if ev.type == LLMEventType.TEXT_DELTA:
                    text_parts.append(ev.delta)
                elif ev.type == LLMEventType.DONE:
                    break
                elif ev.type == LLMEventType.ERROR:
                    return rule_hits
        except Exception:
            return rule_hits
        raw = "".join(text_parts).strip()
        m = re.search(r"\{.*\}", raw, re.DOTALL)
        if not m:
            return rule_hits
        try:
            data = json.loads(m.group(0))
            kws = data.get("keywords") or []
            return [k for k in kws if isinstance(k, str) and k in DIARY_PRESET_KEYWORDS]
        except json.JSONDecodeError:
            return rule_hits

    async def run(
        self,
        params: dict[str, Any],
        *,
        llm: LLMProvider | None = None,
        original_query: str = "",
    ) -> MicroskillResult:
        start: str = params["period_start"]
        end: str = params["period_end"]
        # Pre-extracted keywords (from llm_classify_and_extract) take priority.
        # Falls back to per-skill LLM extract or rule-based hits.
        if "keywords" in params:
            keywords = list(params.get("keywords") or [])
        else:
            keywords = await self._extract_keywords(original_query, llm)
        keywords_csv = ",".join(keywords) if keywords else ",".join(DIARY_PRESET_KEYWORDS)

        sets = await call_sp(
            "sp_task_diary_summary",
            {"@start": start, "@end": end, "@keywords_csv": keywords_csv},
            multi_resultset=True,
        )
        # Expected resultsets:
        #   [0] KPI: 총건수, 작성자수, 일평균, 최다 키워드
        #   [1] 키워드 빈도: 키워드/빈도/작성자수
        #   [2] Top 작성자: 사용자명/작성건수/주요키워드
        kpi = sets[0][0] if sets and sets[0] else {}
        kw_rows = sets[1] if len(sets) > 1 else []
        top_rows = sets[2] if len(sets) > 2 else []

        total = int(kpi.get("총건수", 0) or 0)
        writers = int(kpi.get("작성자수", 0) or 0)
        daily_avg = kpi.get("일평균", "0") or "0"
        top_kw = kpi.get("최다키워드") or (kw_rows[0]["키워드"] if kw_rows else "-")

        title = f"업무일지 보고서 ({start} ~ {end})"
        summary = (
            f"{start}~{end} 총 {total}건 / {writers}명 작성. "
            f"일평균 {daily_avg}건. 최다 키워드 '{top_kw}'."
        )

        report_schema = {
            "title": title,
            "generated_from": (
                f"sp_task_diary_summary(@start='{start}', @end='{end}', "
                f"@keywords_csv='{keywords_csv}')"
            ),
            "summary": {
                "headline": summary,
                "insights": [
                    f"기간 {start} ~ {end}",
                    f"분석 키워드 ({len(keywords) or len(DIARY_PRESET_KEYWORDS)}종): {keywords_csv}",
                    f"Top 작성자 {len(top_rows)}명 (rank highlight 3)",
                ],
            },
            "blocks": [
                {
                    "type": "kpi_grid",
                    "title": "기간 KPI",
                    "columns": 4,
                    "metrics": [
                        {"label": "총 건수", "value": total, "unit": "건", "severity": "good"},
                        {"label": "작성자 수", "value": writers, "unit": "명", "severity": "neutral"},
                        {"label": "일평균", "value": str(daily_avg), "unit": "건", "severity": "neutral"},
                        {"label": "최다 키워드", "value": str(top_kw), "severity": "good"},
                    ],
                },
                {
                    "type": "bubble_breakdown",
                    "title": "키워드 클러스터",
                    "data_ref": 0,
                    "bubble": {"label": "키워드", "size": "빈도", "x": "작성자수"},
                },
                {
                    "type": "ranked_list",
                    "title": "Top 작성자",
                    "data_ref": 1,
                    "fields": {
                        "name": "사용자명",
                        "primary": "작성건수표시",
                        "secondary": "주요키워드",
                    },
                    "limit": 5,
                    "highlight_top": 3,
                },
            ],
            "data_refs": [
                {
                    "id": 0,
                    "mode": "embed",
                    "columns": [
                        {"name": "키워드", "type": "string"},
                        {"name": "빈도", "type": "int"},
                        {"name": "작성자수", "type": "int"},
                    ],
                    "rows": [
                        {
                            "키워드": r.get("키워드", ""),
                            "빈도": int(r.get("빈도", 0) or 0),
                            "작성자수": int(r.get("작성자수", 0) or 0),
                        }
                        for r in kw_rows
                    ],
                },
                {
                    "id": 1,
                    "mode": "embed",
                    "columns": [
                        {"name": "사용자명", "type": "string"},
                        {"name": "작성건수표시", "type": "string"},
                        {"name": "주요키워드", "type": "string"},
                    ],
                    "rows": [
                        {
                            "사용자명": r.get("사용자명", ""),
                            "작성건수표시": f"{r.get('작성건수', 0)}건",
                            "주요키워드": r.get("주요키워드", ""),
                        }
                        for r in top_rows
                    ],
                },
            ],
        }

        return MicroskillResult(
            skill_name=self.name,
            title=title,
            summary=summary,
            domain=self.domain,
            tags=["업무일지", "보고서", start, end, *keywords],
            report_schema=report_schema,
            view_blocks=[
                {"index": 0, "component": "KpiGridBlock"},
                {"index": 1, "component": "BubbleBreakdownBlock"},
                {"index": 2, "component": "RankedListBlock"},
            ],
        )
