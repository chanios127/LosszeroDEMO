"""Microskills — deterministic intent-detected pipelines.

Replaces the full LLM chain (db_query → build_schema → build_view) with a
pre-baked SP call + fixed ReportSchema template for high-frequency intents.
LLM usage is limited to:
  - intent trigger detection (rule-based regex; 0 LLM calls)
  - optional parameter extraction (LLM-light; ~1 call, ~1k input)

Skills register at import time. The dispatcher in main.py checks for a match
on every user query before falling through to the standard AgentLoop.
"""
from microskills.base import MicroskillBase, MicroskillMatch, MicroskillResult
from microskills.registry import MICROSKILLS, dispatch, register

# Auto-register all bundled skills
from microskills.attendance_gantt import AttendanceGanttSkill  # noqa: F401
from microskills.task_diary_report import TaskDiaryReportSkill  # noqa: F401
from microskills.customer_as_pattern import CustomerAsPatternSkill  # noqa: F401

__all__ = [
    "MicroskillBase",
    "MicroskillMatch",
    "MicroskillResult",
    "MICROSKILLS",
    "dispatch",
    "register",
]
