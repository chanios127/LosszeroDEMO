"""Skill 1 — 출근현황 간트차트.

Trigger: 룰 기반 (출근/근태/간트/출퇴근 + 날짜 키워드).
Params: target_date (날짜 정규식 또는 상대 키워드).
LLM 호출: 0회.
SP: sp_attendance_by_date(@date) → rows (사용자명/부서명/출근시각/퇴근시각).
Template: kpi_grid + chart{viz_hint:gantt, anchor mode, group_by=부서명}.
"""
from __future__ import annotations

import logging
import re
from datetime import date as date_cls
from typing import Any

from llm.base import LLMProvider
from microskills._helpers import call_sp, normalize_hhmm, parse_target_date
from microskills.base import MicroskillBase, MicroskillMatch, MicroskillResult

logger = logging.getLogger(__name__)

_TRIGGERS = re.compile(r"(출근|근태|간트|출퇴근|attendance)", re.IGNORECASE)


class AttendanceGanttSkill(MicroskillBase):
    name = "attendance_gantt"
    domain = "groupware"
    description = "출근/근태 현황을 간트차트로 — 트리거 + 날짜만 자동 추출, SP 호출, 템플릿 hydrate"

    def detect(self, query: str, session_domain: str) -> MicroskillMatch:
        if not _TRIGGERS.search(query):
            return MicroskillMatch(matched=False)
        target = parse_target_date(query) or date_cls.today()
        return MicroskillMatch(
            matched=True,
            params={"target_date": target.isoformat()},
            confidence=0.9,
        )

    async def run(
        self,
        params: dict[str, Any],
        *,
        llm: LLMProvider | None = None,
        original_query: str = "",
    ) -> MicroskillResult:
        target_date: str = params["target_date"]
        sets = await call_sp("sp_attendance_by_date", {"@date": target_date})
        rows = sets[0] if sets else []

        # Normalize time columns + filter out empty rows
        clean: list[dict[str, Any]] = []
        for r in rows:
            in_t = normalize_hhmm(r.get("출근시각") or r.get("at_AttTm"))
            if not in_t:
                continue
            out_t = normalize_hhmm(r.get("퇴근시각") or r.get("at_LeavTm"))
            clean.append({
                "사용자명": r.get("사용자명") or r.get("이름") or r.get("uName") or "",
                "부서명": r.get("부서명") or r.get("부서") or r.get("팀") or "(미분류)",
                "출근시각": in_t,
                "퇴근시각": out_t or "미기록",
            })

        total = len(clean)
        out_complete = sum(1 for r in clean if r["퇴근시각"] != "미기록")
        out_missing = total - out_complete

        # 평균 출근 시각
        if total:
            avg_min = sum(
                int(r["출근시각"].split(":")[0]) * 60 + int(r["출근시각"].split(":")[1])
                for r in clean
            ) // total
            avg_label = f"{avg_min // 60:02d}:{avg_min % 60:02d}"
        else:
            avg_label = "-"

        title = f"{target_date} 출근현황 간트차트"
        summary = (
            f"{target_date} 총 {total}명 출근 기록. "
            f"퇴근 완료 {out_complete}명 / 미기록 {out_missing}명. 평균 출근 {avg_label}."
        )

        report_schema = {
            "title": title,
            "generated_from": f"sp_attendance_by_date(@date='{target_date}')",
            "summary": {
                "headline": f"{target_date} 총 {total}명 출근 / 평균 {avg_label}",
                "insights": [
                    f"퇴근 기록 완료 {out_complete}명, 미기록 {out_missing}명",
                    "부서별 출근 시각 분포는 간트차트 참조 (부서당 1개 행)",
                ],
            },
            "blocks": [
                {
                    "type": "kpi_grid",
                    "title": "출근 요약",
                    "columns": 4,
                    "metrics": [
                        {"label": "총 출근", "value": total, "unit": "명", "severity": "good"},
                        {"label": "퇴근 완료", "value": out_complete, "unit": "명", "severity": "neutral"},
                        {"label": "퇴근 미기록", "value": out_missing, "unit": "명",
                         "severity": "warning" if out_missing else "good"},
                        {"label": "평균 출근", "value": avg_label, "severity": "neutral"},
                    ],
                },
                {
                    "type": "chart",
                    "viz_hint": "gantt",
                    "data_ref": 0,
                    "x": "사용자명",
                    "y": "출근시각",
                    "group_by": "부서명",
                    "title": "부서별 출근 시각 분포",
                },
            ],
            "data_refs": [
                {
                    "id": 0,
                    "mode": "embed",
                    "columns": [
                        {"name": "사용자명", "type": "string"},
                        {"name": "부서명", "type": "string"},
                        {"name": "출근시각", "type": "string"},
                        {"name": "퇴근시각", "type": "string"},
                    ],
                    "rows": clean,
                },
            ],
        }

        return MicroskillResult(
            skill_name=self.name,
            title=title,
            summary=summary,
            domain=self.domain,
            tags=["근태", "출근", "간트", target_date],
            report_schema=report_schema,
            view_blocks=[
                {"index": 0, "component": "KpiGridBlock"},
                {"index": 1, "component": "GanttBlock"},
            ],
        )
