"""Shared helpers for microskills — SP execution + date parsing."""
from __future__ import annotations

import asyncio
import logging
import re
from datetime import date, datetime, timedelta
from typing import Any

from db.connection import get_connection

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Date parsing
# ---------------------------------------------------------------------------

_RE_YMD = re.compile(r"(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})")
_RE_MD_KO = re.compile(r"(\d{1,2})\s*월\s*(\d{1,2})\s*일")
_RELATIVE_KO = {
    "오늘": 0,
    "today": 0,
    "어제": -1,
    "yesterday": -1,
    "그제": -2,
    "내일": 1,
    "tomorrow": 1,
}


def parse_target_date(query: str, *, base: date | None = None) -> date | None:
    """Pull the first date reference out of free-form Korean query.

    Priority:
      1. YYYY-MM-DD / YYYY/MM/DD / YYYY.MM.DD literal
      2. M월 D일 (current year assumed)
      3. relative keyword (오늘 / 어제 / 그제 / 내일)
    """
    base = base or date.today()
    m = _RE_YMD.search(query)
    if m:
        try:
            return date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
        except ValueError:
            pass
    m = _RE_MD_KO.search(query)
    if m:
        try:
            return date(base.year, int(m.group(1)), int(m.group(2)))
        except ValueError:
            pass
    for kw, offset in _RELATIVE_KO.items():
        if kw in query:
            return base + timedelta(days=offset)
    return None


def parse_period(query: str, *, base: date | None = None) -> tuple[date, date] | None:
    """Pull a period range out of a query.

    Recognizes 이번주 / 지난주 / 이번달 / 지난달 / 최근 N일 / N주 / N개월.
    Returns (start_inclusive, end_inclusive) or None.
    """
    base = base or date.today()
    if "이번주" in query or "금주" in query:
        start = base - timedelta(days=base.weekday())
        return (start, start + timedelta(days=6))
    if "지난주" in query:
        start = base - timedelta(days=base.weekday() + 7)
        return (start, start + timedelta(days=6))
    if "이번달" in query or "금월" in query:
        start = base.replace(day=1)
        next_month = (start.replace(day=28) + timedelta(days=4)).replace(day=1)
        return (start, next_month - timedelta(days=1))
    if "지난달" in query or "전월" in query:
        first_this = base.replace(day=1)
        last_prev = first_this - timedelta(days=1)
        return (last_prev.replace(day=1), last_prev)
    m = re.search(r"최근\s*(\d{1,3})\s*일", query)
    if m:
        n = int(m.group(1))
        return (base - timedelta(days=n - 1), base)
    m = re.search(r"최근\s*(\d{1,2})\s*주", query)
    if m:
        n = int(m.group(1))
        return (base - timedelta(days=n * 7 - 1), base)
    m = re.search(r"최근\s*(\d{1,2})\s*(개월|달)", query)
    if m:
        n = int(m.group(1))
        return (base - timedelta(days=n * 30 - 1), base)
    return None


# ---------------------------------------------------------------------------
# SP execution — multi-resultset aware
# ---------------------------------------------------------------------------

async def call_sp(
    sp_name: str,
    params: dict[str, Any] | None = None,
    *,
    multi_resultset: bool = False,
) -> list[list[dict[str, Any]]]:
    """Execute a stored procedure and return its result sets.

    Returns a list of resultsets, each a list of row dicts.
      - multi_resultset=False (default): always 1 element list (single set).
      - multi_resultset=True: walks cursor.nextset() until exhausted.

    Param keys may have or omit `@` prefix — both are normalized to `@name=?`.
    """
    params = params or {}
    clean = {k.lstrip("@"): v for k, v in params.items()}
    param_str = ", ".join(f"@{k}=?" for k in clean)
    sql = f"EXEC {sp_name} {param_str}".strip()

    async with get_connection() as conn:
        loop = asyncio.get_event_loop()

        def _run() -> list[list[dict[str, Any]]]:
            cursor = conn.cursor()
            cursor.execute(sql, list(clean.values()))
            sets: list[list[dict[str, Any]]] = []
            while True:
                if cursor.description:
                    cols = [c[0] for c in cursor.description]
                    rows = [dict(zip(cols, r)) for r in cursor.fetchall()]
                    sets.append(rows)
                else:
                    sets.append([])
                if not multi_resultset:
                    break
                if not cursor.nextset():
                    break
            cursor.close()
            return sets

        return await loop.run_in_executor(None, _run)


# ---------------------------------------------------------------------------
# Time-string normalization (for gantt anchor mode)
# ---------------------------------------------------------------------------

def normalize_hhmm(value: Any) -> str | None:
    """Best-effort coerce SQL time-ish value into 'HH:MM' display string.

    Accepts: 'HHMMSS' / 'HH:MM[:SS]' / datetime / time / None.
    Returns None when value can't be sanely interpreted.
    Skips '00:00:00' from datetime columns where time portion was zeroed.
    """
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        h, m = value.hour, value.minute
        if h == 0 and m == 0 and value.second == 0:
            return None  # zero-time = column is date-only, not a real clock-in
        return f"{h:02d}:{m:02d}"
    if hasattr(value, "hour") and hasattr(value, "minute"):  # datetime.time
        return f"{value.hour:02d}:{value.minute:02d}"
    if isinstance(value, str):
        s = value.strip()
        if not s or s.startswith("00:00") and ":" in s and len(s) >= 5:
            # filter "00:00", "00:00:00" — same logic as datetime zero-time
            if s.replace(":", "").replace("0", "") == "":
                return None
        m = re.match(r"^(\d{1,2}):(\d{2})", s)
        if m:
            return f"{int(m.group(1)):02d}:{m.group(2)}"
        if re.match(r"^\d{6}$", s):  # HHMMSS
            return f"{s[:2]}:{s[2:4]}"
        if re.match(r"^\d{4}$", s):  # HHMM
            return f"{s[:2]}:{s[2:]}"
    return None
