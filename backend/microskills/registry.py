"""Skill registry — runtime list of registered microskills."""
from __future__ import annotations

import logging
import re
from typing import Any

from microskills.base import MicroskillBase, MicroskillMatch, MicroskillResult

logger = logging.getLogger(__name__)

MICROSKILLS: list[MicroskillBase] = []

# A query is treated as a *new* microskill request only when it carries a
# strong action verb (보고서 작성 / 분석 / 시각화) along with the topic keyword.
# Without this guard, follow-up questions like "가장 일찍 출근한 인원은?"
# (only "출근" topic, no action verb, ends in interrogative) would re-trigger
# attendance_gantt instead of falling through to AgentLoop for a follow-up answer.
_ACTION_VERBS = re.compile(
    r"(만들어|작성|보여|보고서|분석|간트|시각화|차트|그려|뽑아|정리|요약|"
    r"리포트|report|chart|gantt)",
    re.IGNORECASE,
)
# Interrogatives that strongly signal a follow-up question, NOT a new skill.
_FOLLOWUP_HINTS = re.compile(
    r"(누구|언제|어디|왜|어떻게|얼마|몇\s*명|몇\s*건|뭐|무엇|어느|이유|"
    r"인원은\?|사람은\?|있어\?|있나\?|이야\?|인가\?)"
)


def _looks_like_followup(query: str) -> bool:
    """Heuristic: short interrogative-style query without a clear action verb.

    Returns True when we should NOT trigger a new microskill (let the
    AgentLoop handle it as a follow-up to existing context).
    """
    if _ACTION_VERBS.search(query):
        return False
    if _FOLLOWUP_HINTS.search(query):
        return True
    # Very short queries (≤ 12 chars) without an action verb are usually
    # follow-ups too ("그럼 어제는?" / "박창권은?" 등).
    if len(query.strip()) <= 12:
        return True
    return False


def register(skill: MicroskillBase) -> MicroskillBase:
    """Idempotent register — same name skips."""
    if any(s.name == skill.name for s in MICROSKILLS):
        return skill
    MICROSKILLS.append(skill)
    logger.info("microskill registered: %s (domain=%s)", skill.name, skill.domain or "*")
    return skill


def find_by_name(name: str) -> MicroskillBase | None:
    """Lookup by skill.name."""
    return next((s for s in MICROSKILLS if s.name == name), None)


def dispatch(query: str, session_domain: str) -> tuple[MicroskillBase, MicroskillMatch] | None:
    """Find the first matching skill — domain-aware, highest confidence wins.

    Follow-up-style queries (interrogative without an action verb) are
    rejected so the AgentLoop can answer in the existing conversation
    context instead of re-running a microskill.
    """
    if _looks_like_followup(query):
        logger.debug("microskill dispatch: rejecting follow-up-style query: %r", query)
        return None
    candidates: list[tuple[MicroskillBase, MicroskillMatch]] = []
    for skill in MICROSKILLS:
        if skill.domain and skill.domain != session_domain:
            continue
        match = skill.detect(query, session_domain)
        if match.matched:
            candidates.append((skill, match))
    if not candidates:
        return None
    candidates.sort(key=lambda x: x[1].confidence, reverse=True)
    return candidates[0]


async def run_microskill(
    skill: MicroskillBase,
    match: MicroskillMatch,
    *,
    llm: Any = None,
    original_query: str = "",
) -> MicroskillResult:
    """Convenience runner — passes match.params + optional llm."""
    return await skill.run(match.params, llm=llm, original_query=original_query)
