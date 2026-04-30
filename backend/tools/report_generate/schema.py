"""Pydantic model for report_generate sub_agent output."""
from __future__ import annotations

from pydantic import BaseModel, Field


class GeneratedReportMeta(BaseModel):
    """Metadata layer that wraps a ReportSchema for archival.

    Returned by the ``report_generate`` sub_agent. ``title`` becomes the
    archive entry's display name; ``summary`` is a 1~2 sentence digest for
    the proposal card; ``domain`` is the matched domain code (e.g. ``"3z_mes"``,
    ``"groupware"``); ``tags`` are 3~5 short labels for archive filtering.
    """
    title: str
    summary: str
    domain: str = ""
    tags: list[str] = Field(default_factory=list)
