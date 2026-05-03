"""Skill 3 — 거래처별 AS 요청 패턴 분석.

Trigger: 룰 (AS / 거래처 / 현안 / 패턴).
Params:
  - days (룰 — 최근 N일, 기본 90)
  - vendor_filter (옵션 — 사용자 발화에 거래처명이 있을 때)
  - keywords (LLM-light 추출, preset 매칭만 채택)
LLM 호출: 1회 (keyword extract).
SP: sp_customer_as_pattern(@days, @vendor, @keywords_csv) → multi-resultset.
Template: kpi_grid(severity) + chart{pie} + ranked_list + bubble + chart{radar long}.
"""
from __future__ import annotations

import json
import logging
import re
from typing import Any

from llm.base import LLMEventType, LLMProvider, Message
from microskills._helpers import call_sp
from microskills.base import MicroskillBase, MicroskillMatch, MicroskillResult

logger = logging.getLogger(__name__)

_TRIGGERS = re.compile(r"(AS\s*요청|AS\s*현안|거래처|현안|AS\s*패턴|고객사)", re.IGNORECASE)

AS_PRESET_KEYWORDS = [
    "재고", "생산", "키오스크", "BOM", "품질", "원가", "급여",
]


class CustomerAsPatternSkill(MicroskillBase):
    name = "customer_as_pattern"
    domain = "3z"
    description = "거래처 AS 요청 패턴 — 기간 + 키워드(LLM 추출) → SP → 고정 템플릿"

    def detect(self, query: str, session_domain: str) -> MicroskillMatch:
        if not _TRIGGERS.search(query):
            return MicroskillMatch(matched=False)
        days = self._extract_days(query)
        return MicroskillMatch(
            matched=True,
            params={"days": days},
            confidence=0.85,
            needs_llm_extract=True,
        )

    def _extract_days(self, query: str) -> int:
        m = re.search(r"최근\s*(\d{1,3})\s*일", query)
        if m:
            return int(m.group(1))
        m = re.search(r"최근\s*(\d{1,2})\s*주", query)
        if m:
            return int(m.group(1)) * 7
        m = re.search(r"최근\s*(\d{1,2})\s*(개월|달)", query)
        if m:
            return int(m.group(1)) * 30
        return 90

    async def _extract_filters(
        self,
        query: str,
        llm: LLMProvider | None,
    ) -> tuple[list[str], str | None]:
        """LLM-light 키워드 + 거래처 필터 추출."""
        rule_kws = [k for k in AS_PRESET_KEYWORDS if k in query]
        # 룰베이스로 vendor 추출은 어려우니 LLM에 위임
        if rule_kws and not re.search(r"(주\)|회사|업체)", query):
            return rule_kws, None
        if not llm:
            return rule_kws, None

        sys = (
            "사용자 발화에서 (1) 업무 키워드, (2) 거래처명 추출. "
            f"키워드 허용 목록 (이 외는 무시): {', '.join(AS_PRESET_KEYWORDS)}. "
            "거래처명은 발화에 명시된 경우만, 없으면 null. "
            "JSON 한 줄: {\"keywords\":[\"...\"], \"vendor\": \"...\" or null}"
        )
        msgs: list[Message] = [
            {"role": "system", "content": sys},
            {"role": "user", "content": query},
        ]
        text_parts: list[str] = []
        try:
            async for ev in llm.complete(msgs, [], max_tokens=300):
                if ev.type == LLMEventType.TEXT_DELTA:
                    text_parts.append(ev.delta)
                elif ev.type == LLMEventType.DONE:
                    break
                elif ev.type == LLMEventType.ERROR:
                    return rule_kws, None
        except Exception:
            return rule_kws, None
        raw = "".join(text_parts).strip()
        m = re.search(r"\{.*\}", raw, re.DOTALL)
        if not m:
            return rule_kws, None
        try:
            data = json.loads(m.group(0))
            kws = [k for k in (data.get("keywords") or []) if isinstance(k, str) and k in AS_PRESET_KEYWORDS]
            vendor = data.get("vendor")
            if not isinstance(vendor, str) or not vendor.strip():
                vendor = None
            return (kws or rule_kws), vendor
        except json.JSONDecodeError:
            return rule_kws, None

    async def run(
        self,
        params: dict[str, Any],
        *,
        llm: LLMProvider | None = None,
        original_query: str = "",
    ) -> MicroskillResult:
        days: int = int(params.get("days", 90))
        keywords, vendor = await self._extract_filters(original_query, llm)
        keywords_csv = ",".join(keywords) if keywords else ",".join(AS_PRESET_KEYWORDS)

        sp_params: dict[str, Any] = {"@days": days, "@keywords_csv": keywords_csv}
        if vendor:
            sp_params["@vendor"] = vendor

        sets = await call_sp("sp_customer_as_pattern", sp_params, multi_resultset=True)
        # Expected resultsets:
        #   [0] KPI: 총건수 / 거래처수 / 최다거래처 / 재발률
        #   [1] 작업유형 분포: 작업유형명 / 건수
        #   [2] Top 거래처: 거래처명 / 요청건수표시 / 재발률표시 / 주요유형
        #   [3] 키워드 클러스터 (bubble): 키워드 / 등장횟수 / 거래처다양성
        #   [4] 거래처×카테고리 long format (radar): category / value / series
        kpi = sets[0][0] if sets and sets[0] else {}
        type_rows = sets[1] if len(sets) > 1 else []
        vendor_rows = sets[2] if len(sets) > 2 else []
        kw_rows = sets[3] if len(sets) > 3 else []
        radar_rows = sets[4] if len(sets) > 4 else []

        total = int(kpi.get("총건수", 0) or 0)
        vendors = int(kpi.get("거래처수", 0) or 0)
        top_vendor = kpi.get("최다거래처") or "-"
        recur_rate = kpi.get("재발률") or "0%"

        title = (
            f"거래처별 AS 요청 패턴 분석 (최근 {days}일"
            f"{' · ' + vendor if vendor else ''})"
        )
        summary = (
            f"최근 {days}일 총 {total}건 / {vendors}개 거래처. "
            f"최다 '{top_vendor}'. 재발률 {recur_rate}."
        )

        report_schema = {
            "title": title,
            "generated_from": (
                f"sp_customer_as_pattern(@days={days}, "
                f"@vendor={vendor or 'NULL'}, @keywords_csv='{keywords_csv}')"
            ),
            "summary": {
                "headline": summary,
                "insights": [
                    f"분석 키워드 ({len(keywords) or len(AS_PRESET_KEYWORDS)}종): {keywords_csv}",
                    f"거래처 필터: {vendor or '전체'}",
                    f"작업유형 분포 {len(type_rows)}종 / 거래처 Top {len(vendor_rows)}",
                ],
            },
            "blocks": [
                {
                    "type": "kpi_grid",
                    "title": "AS 위험도 KPI",
                    "columns": 4,
                    "metrics": [
                        {"label": "총 요청", "value": total, "unit": "건", "severity": "neutral"},
                        {"label": "거래처 수", "value": vendors, "unit": "곳", "severity": "neutral"},
                        {"label": "최다 거래처", "value": str(top_vendor),
                         "severity": "warning" if top_vendor != "-" else "neutral"},
                        {"label": "재발률", "value": str(recur_rate),
                         "severity": self._severity_for_recur(recur_rate)},
                    ],
                },
                {
                    "type": "chart",
                    "viz_hint": "pie_chart",
                    "data_ref": 0,
                    "x": "작업유형명",
                    "y": "건수",
                    "title": "작업유형 분포",
                },
                {
                    "type": "ranked_list",
                    "title": "거래처별 요청 건수 Top 5",
                    "data_ref": 1,
                    "fields": {
                        "name": "거래처명",
                        "primary": "요청건수표시",
                        "secondary": "재발률표시",
                        "tags": "주요유형",
                    },
                    "limit": 5,
                    "highlight_top": 3,
                },
                {
                    "type": "bubble_breakdown",
                    "title": "키워드 클러스터 (현안 제목 기반)",
                    "data_ref": 2,
                    "bubble": {"label": "키워드", "size": "등장횟수", "x": "거래처다양성"},
                },
                {
                    "type": "chart",
                    "viz_hint": "radar",
                    "data_ref": 3,
                    "x": "category",
                    "y": "value",
                    "group_by": "series",
                    "title": "Top 거래처 vs 전사 평균 (카테고리 분포)",
                },
            ],
            "data_refs": [
                {
                    "id": 0,
                    "mode": "embed",
                    "columns": [
                        {"name": "작업유형명", "type": "string"},
                        {"name": "건수", "type": "int"},
                    ],
                    "rows": [
                        {"작업유형명": r.get("작업유형명", ""), "건수": int(r.get("건수", 0) or 0)}
                        for r in type_rows
                    ],
                },
                {
                    "id": 1,
                    "mode": "embed",
                    "columns": [
                        {"name": "거래처명", "type": "string"},
                        {"name": "요청건수표시", "type": "string"},
                        {"name": "재발률표시", "type": "string"},
                        {"name": "주요유형", "type": "string"},
                    ],
                    "rows": [
                        {
                            "거래처명": r.get("거래처명", ""),
                            "요청건수표시": f"{r.get('요청건수', 0)}건",
                            "재발률표시": str(r.get("재발률", "0%")),
                            "주요유형": r.get("주요유형", ""),
                        }
                        for r in vendor_rows
                    ],
                },
                {
                    "id": 2,
                    "mode": "embed",
                    "columns": [
                        {"name": "키워드", "type": "string"},
                        {"name": "등장횟수", "type": "int"},
                        {"name": "거래처다양성", "type": "int"},
                    ],
                    "rows": [
                        {
                            "키워드": r.get("키워드", ""),
                            "등장횟수": int(r.get("등장횟수", 0) or 0),
                            "거래처다양성": int(r.get("거래처다양성", 0) or 0),
                        }
                        for r in kw_rows
                    ],
                },
                {
                    "id": 3,
                    "mode": "embed",
                    "columns": [
                        {"name": "category", "type": "string"},
                        {"name": "value", "type": "int"},
                        {"name": "series", "type": "string"},
                    ],
                    "rows": [
                        {
                            "category": r.get("category", ""),
                            "value": int(r.get("value", 0) or 0),
                            "series": r.get("series", ""),
                        }
                        for r in radar_rows
                    ],
                },
            ],
        }

        return MicroskillResult(
            skill_name=self.name,
            title=title,
            summary=summary,
            domain=self.domain,
            tags=["AS", "거래처", "패턴", f"{days}일", *keywords, *([vendor] if vendor else [])],
            report_schema=report_schema,
            view_blocks=[
                {"index": 0, "component": "KpiGridBlock"},
                {"index": 1, "component": "ChartBlock"},
                {"index": 2, "component": "RankedListBlock"},
                {"index": 3, "component": "BubbleBreakdownBlock"},
                {"index": 4, "component": "RadarBlock"},
            ],
        )

    @staticmethod
    def _severity_for_recur(recur_str: str) -> str:
        m = re.search(r"(\d+(?:\.\d+)?)", str(recur_str))
        if not m:
            return "neutral"
        v = float(m.group(1))
        if v >= 30:
            return "alert"
        if v >= 15:
            return "warning"
        return "good"
