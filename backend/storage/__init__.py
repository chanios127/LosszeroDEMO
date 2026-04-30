"""Persistence layer for the LLM Harness.

Currently a thin JSON-file store under ``<repo>/storage/reports/`` so the
demo has zero infrastructure dependencies. Designed to be swappable for
SQLite/Postgres in a later cycle without touching call sites — the public
functions in ``reports.py`` are the contract.
"""
from .reports import (
    Report,
    delete_report,
    get_report,
    list_reports,
    save_report,
)

__all__ = [
    "Report",
    "delete_report",
    "get_report",
    "list_reports",
    "save_report",
]
