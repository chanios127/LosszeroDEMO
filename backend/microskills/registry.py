"""Skill registry — runtime list of registered microskills."""
from __future__ import annotations

import logging
from typing import Any

from microskills.base import MicroskillBase, MicroskillMatch, MicroskillResult

logger = logging.getLogger(__name__)

MICROSKILLS: list[MicroskillBase] = []


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
    """Find the first matching skill — domain-aware, highest confidence wins."""
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
