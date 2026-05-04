"""Shared helpers for microskills — SP execution + date parsing + LLM enrichment."""
from __future__ import annotations

import asyncio
import json
import logging
import re
from datetime import date, datetime, timedelta
from typing import Any

from db.connection import get_connection
from llm.base import LLMEventType, LLMProvider, Message
from microskills.base import MicroskillResult

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

async def enrich_microskill_report(
    result: MicroskillResult,
    llm: LLMProvider | None,
    *,
    original_query: str = "",
    insights_target: int = 6,
    narrative_max_words: int = 350,
) -> MicroskillResult:
    """One LLM pass that takes a microskill's raw SP-derived report and
    produces a richer summary + analytical markdown block.

    Mutates result.report_schema in place:
      - summary.headline    → re-written to a punchier 1-line headline
      - summary.insights    → 5~7 bullet points (was 2-3)
      - blocks              → +1 markdown block "📝 분석" appended at the end
      - view_blocks         → +1 entry for the new markdown block
      - result.summary      → mirror of new headline (for ProposalCard)

    Failure-safe: any LLM error / JSON parse miss returns result unchanged.
    """
    if llm is None:
        return result

    schema = result.report_schema
    summary = schema.get("summary") or {}
    base_headline = summary.get("headline") or ""
    base_insights = summary.get("insights") or []

    # Compact data sample — first 25 rows per data_ref (or fewer for radar/long).
    data_lines: list[str] = []
    for dr in schema.get("data_refs") or []:
        if dr.get("mode") != "embed":
            continue
        rows = dr.get("rows") or []
        sample = rows[:25]
        cols = [c.get("name") for c in (dr.get("columns") or [])]
        omitted = len(rows) - len(sample)
        note = f"  (...{omitted} more rows)" if omitted else ""
        data_lines.append(
            f"[data_ref id={dr.get('id')}] columns={cols}\n"
            + json.dumps(sample, ensure_ascii=False, default=str)
            + note
        )
    data_block = "\n\n".join(data_lines) if data_lines else "(no rows)"

    blocks_summary = ", ".join(
        f"{b.get('type')}{'(' + b.get('viz_hint', '') + ')' if b.get('viz_hint') else ''}"
        for b in schema.get("blocks") or []
    )

    sys_prompt = (
        "당신은 사내 데이터 보고서 분석가입니다. microskill SP 결과셋과 기존 요약을 받아 "
        "더 풍성한 분석을 생성합니다. 출력은 JSON 한 줄.\n"
        "\n"
        "출력 스키마:\n"
        "{\n"
        '  "headline": str,        // 1줄 헤드라인 (60자 내외)\n'
        f'  "insights": [str, ...], // {insights_target}개 내외 bullet, 각 60자 내외\n'
        '  "narrative": str        // 마크다운 분석 본문 ('
        f"{narrative_max_words}단어 내외)\n"
        "}\n"
        "\n"
        "분석 본문에는:\n"
        "- 핵심 수치 1~2개 강조 (**bold**)\n"
        "- 패턴/이상치 발견 (있으면)\n"
        "- 후속 액션 제언 1~2개\n"
        "- ## 헤딩 1개 + 짧은 단락 2~3개 구성\n"
        "- 구체적 거래처/직원/키워드 이름을 인용\n"
        "JSON 외 텍스트 / 마크다운 펜스 금지."
    )
    user_prompt = (
        f"# microskill 결과 요약\n\n"
        f"- skill: {result.skill_name}\n"
        f"- title: {result.title}\n"
        f"- domain: {result.domain}\n"
        f"- 사용자 발화: {original_query or '(없음)'}\n"
        f"- 기존 headline: {base_headline}\n"
        f"- 기존 insights: {base_insights}\n"
        f"- 블록 구성: {blocks_summary}\n\n"
        f"# 결과셋 데이터\n\n{data_block}\n\n"
        f"위 데이터로 분석 출력 JSON을 생성하시오."
    )
    msgs: list[Message] = [
        {"role": "system", "content": sys_prompt},
        {"role": "user", "content": user_prompt},
    ]

    text_parts: list[str] = []
    try:
        async for ev in llm.complete(
            msgs, [], max_tokens=1200, system_base=False
        ):
            if ev.type == LLMEventType.TEXT_DELTA:
                text_parts.append(ev.delta)
            elif ev.type == LLMEventType.DONE:
                break
            elif ev.type == LLMEventType.ERROR:
                logger.warning("microskill enrich LLM error: %s", ev.message)
                return result
    except Exception as e:
        logger.warning("microskill enrich exception: %s", e)
        return result

    raw = "".join(text_parts).strip()
    raw = re.sub(r"<think>.*?</think>", "", raw, flags=re.DOTALL).strip()
    m = re.search(r"\{.*\}", raw, re.DOTALL)
    if not m:
        logger.warning("microskill enrich: no JSON in output: %r", raw[:200])
        return result
    try:
        data = json.loads(m.group(0))
    except json.JSONDecodeError as e:
        logger.warning("microskill enrich JSON parse failed: %s", e)
        return result

    new_headline = (data.get("headline") or "").strip() or base_headline
    new_insights_raw = data.get("insights") or []
    new_insights = [
        str(s).strip() for s in new_insights_raw if isinstance(s, (str, int, float))
    ] or base_insights
    narrative = (data.get("narrative") or "").strip()

    # Mutate schema
    summary["headline"] = new_headline
    summary["insights"] = new_insights
    schema["summary"] = summary

    if narrative:
        blocks = schema.get("blocks") or []
        narrative_block = {"type": "markdown", "content": narrative}
        blocks.append(narrative_block)
        schema["blocks"] = blocks
        new_idx = len(blocks) - 1
        result.view_blocks = list(result.view_blocks) + [
            {"index": new_idx, "component": "MarkdownBlock"}
        ]

    # Mirror headline into result.summary for ProposalCard meta strip
    result.summary = new_headline
    return result


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
