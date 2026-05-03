"""MicroskillBase — abstract contract for deterministic skills."""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any

from llm.base import LLMProvider


@dataclass
class MicroskillMatch:
    """Outcome of a skill's intent detector."""
    matched: bool
    params: dict[str, Any] = field(default_factory=dict)
    confidence: float = 1.0
    needs_llm_extract: bool = False


@dataclass
class MicroskillResult:
    """Outcome of a skill run.

    `report_schema` is the fully hydrated ReportSchema dict (matches
    backend/tools/build_schema/schema.py::ReportSchema), ready to be wrapped
    in a ReportProposedEvent + stored.
    """
    skill_name: str
    title: str
    summary: str
    domain: str
    tags: list[str]
    report_schema: dict
    # ViewBundle blocks — supplies component routing matching the schema.
    # When empty, ReportContainer falls back to renderByType.
    view_blocks: list[dict] = field(default_factory=list)


class MicroskillBase(ABC):
    """Abstract microskill — implement detect() + run()."""

    name: str = ""
    domain: str = ""  # groupware / 3z / "" for cross-domain
    description: str = ""

    @abstractmethod
    def detect(self, query: str, session_domain: str) -> MicroskillMatch:
        """Rule-based first-pass intent detection. No LLM access here."""

    @abstractmethod
    async def run(
        self,
        params: dict[str, Any],
        *,
        llm: LLMProvider | None = None,
        original_query: str = "",
    ) -> MicroskillResult:
        """Execute pipeline. May call llm for narrow tasks (param extraction,
        markdown summary). SP calls live here too."""
