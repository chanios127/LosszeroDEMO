"""JSON-file Report store.

Layout: one file per report at ``<reports_dir>/<id>.json``. ``<reports_dir>``
defaults to ``<repo_root>/storage/reports`` and can be overridden via the
``REPORTS_DATA_DIR`` env var (handy for tests + future Docker volumes).

Migration path: the public API (save / list / get / delete) is intentionally
narrow so a SQLite or Postgres adapter can drop in without changing
``main.py`` / ``report_generate``.
"""
from __future__ import annotations

import json
import logging
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from tools.build_schema.schema import ReportSchema

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

_BACKEND_DIR = Path(__file__).resolve().parents[1]
_REPO_ROOT = _BACKEND_DIR.parent
_DEFAULT_REPORTS_DIR = _REPO_ROOT / "storage" / "reports"


def _reports_dir() -> Path:
    """Resolve the reports directory (env override → default), creating if absent."""
    raw = os.environ.get("REPORTS_DATA_DIR", "").strip()
    target = Path(raw) if raw else _DEFAULT_REPORTS_DIR
    target.mkdir(parents=True, exist_ok=True)
    return target


# ---------------------------------------------------------------------------
# Pydantic model
# ---------------------------------------------------------------------------

class Report(BaseModel):
    """Persisted report — wraps a ReportSchema with archival metadata.

    ``schema_`` is an alias trick: the JSON / API key is ``schema`` but the
    Python attribute is ``schema_`` to avoid shadowing BaseModel.schema().
    """
    id: str = Field(default_factory=lambda: uuid.uuid4().hex[:12])
    title: str
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc)
    )
    domain: str = ""
    tags: list[str] = Field(default_factory=list)
    schema_: ReportSchema = Field(alias="schema")
    summary: str = ""
    meta: dict[str, Any] = Field(default_factory=dict)

    model_config = ConfigDict(populate_by_name=True)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def save_report(report: Report) -> Report:
    """Persist a Report as ``<reports_dir>/<id>.json`` (atomic write)."""
    target_dir = _reports_dir()
    target = target_dir / f"{report.id}.json"
    tmp = target_dir / f".{report.id}.json.tmp"

    payload = report.model_dump(mode="json", by_alias=True)
    tmp.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    os.replace(tmp, target)
    logger.info("storage.save_report: wrote %s", target.name)
    return report


def list_reports() -> list[dict[str, Any]]:
    """Return a lightweight listing — ``[{id, title, created_at, domain, tags}, ...]``.

    Sorted by created_at desc (newest first). Skips files that fail to parse so
    one bad file doesn't take the whole archive offline.
    """
    out: list[dict[str, Any]] = []
    target_dir = _reports_dir()
    for path in target_dir.glob("*.json"):
        if path.name.startswith("."):
            continue
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError) as exc:
            logger.warning("storage.list_reports: skip %s (%s)", path.name, exc)
            continue
        out.append({
            "id": data.get("id", path.stem),
            "title": data.get("title", "(untitled)"),
            "created_at": data.get("created_at"),
            "domain": data.get("domain", ""),
            "tags": data.get("tags", []),
        })
    out.sort(key=lambda r: r.get("created_at") or "", reverse=True)
    return out


def get_report(report_id: str) -> Report | None:
    """Return the full Report or None if not found / corrupt."""
    target = _reports_dir() / f"{report_id}.json"
    if not target.exists():
        return None
    try:
        data = json.loads(target.read_text(encoding="utf-8"))
        return Report.model_validate(data)
    except (json.JSONDecodeError, OSError, ValueError) as exc:
        logger.warning("storage.get_report: load failed for %s (%s)", report_id, exc)
        return None


def delete_report(report_id: str) -> bool:
    """Delete the report file. Return True if a file was removed."""
    target = _reports_dir() / f"{report_id}.json"
    if not target.exists():
        return False
    try:
        target.unlink()
        logger.info("storage.delete_report: removed %s.json", report_id)
        return True
    except OSError as exc:
        logger.warning("storage.delete_report: unlink failed for %s (%s)", report_id, exc)
        return False
