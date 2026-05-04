"""LLM-based intent classifier + entity extractor for microskills.

Single LLM call (~1.5k input, ~80 token output) replaces 3 regex triggers.
Output is JSON: {intent, keywords, vendor}.

- intent: one of {attendance_gantt | task_diary_report | customer_as_pattern | none}
- keywords: subset of preset 7종 (재고/생산/키오스크/BOM/품질/원가/급여) — empty list when none
- vendor: 거래처명 if explicitly named in the user query, else null
"""
from __future__ import annotations

import json
import logging
import re
from typing import Any

from llm.base import LLMEventType, LLMProvider, Message

logger = logging.getLogger(__name__)

INTENTS = ("attendance_gantt", "task_diary_report", "customer_as_pattern", "none")

# Shared preset for skills 2 and 3
PRESET_KEYWORDS = ["재고", "생산", "키오스크", "BOM", "품질", "원가", "급여"]

_SYSTEM_PROMPT = (
    "사용자 질의를 사내 보고서 microskill 한 가지로 분류하고 엔티티를 추출.\n"
    "\n"
    "intent (정확히 한 값):\n"
    "  - attendance_gantt: 특정 일자의 출근/근태/출퇴근 현황 시각화 요청\n"
    "  - task_diary_report: 업무일지/일지/업무보고 분석 보고서\n"
    "  - customer_as_pattern: 거래처/AS/고객사/현안 요청 패턴 분석\n"
    "  - none: 위 셋 중 어느 것도 아닌 자유 질의 / 일반 데이터 분석\n"
    "\n"
    "엔티티 (intent != none 일 때만 의미 있음):\n"
    f"  - keywords: {PRESET_KEYWORDS} 중 사용자 발화에 명시된 것. 없으면 빈 배열.\n"
    "  - vendor: 사용자 발화에 거래처명이 명시된 경우만 string. 없으면 null.\n"
    "\n"
    "출력은 JSON 한 줄. 마크다운 펜스 X, 설명 X.\n"
    '{"intent":"...","keywords":[...],"vendor":null}'
)


async def llm_classify_and_extract(
    query: str,
    llm: LLMProvider,
) -> dict[str, Any] | None:
    """Run the LLM intent classifier + entity extractor.

    Returns parsed dict on success, or None on any failure (caller should
    fall back to rule-based dispatch or the standard AgentLoop).
    """
    msgs: list[Message] = [
        {"role": "system", "content": _SYSTEM_PROMPT},
        {"role": "user", "content": query},
    ]
    text_parts: list[str] = []
    try:
        # system_base=False: detector doesn't need the harness's 13k system prompt;
        # it would push small models past their context window and trigger 400.
        async for ev in llm.complete(msgs, [], max_tokens=160, system_base=False):
            if ev.type == LLMEventType.TEXT_DELTA:
                text_parts.append(ev.delta)
            elif ev.type == LLMEventType.DONE:
                break
            elif ev.type == LLMEventType.ERROR:
                logger.warning("microskill detector LLM error: %s", ev.message)
                return None
    except Exception as e:
        logger.warning("microskill detector exception: %s", e)
        return None

    raw = "".join(text_parts).strip()
    # Strip <think> blocks (some reasoning models leak them)
    raw = re.sub(r"<think>.*?</think>", "", raw, flags=re.DOTALL).strip()
    m = re.search(r"\{.*\}", raw, re.DOTALL)
    if not m:
        logger.warning("microskill detector: no JSON in output: %r", raw[:200])
        return None
    try:
        data = json.loads(m.group(0))
    except json.JSONDecodeError as e:
        logger.warning("microskill detector JSON parse failed: %s", e)
        return None

    intent = data.get("intent")
    if intent not in INTENTS:
        logger.warning("microskill detector: invalid intent %r", intent)
        return None
    if intent == "none":
        return {"intent": "none", "keywords": [], "vendor": None}

    raw_kws = data.get("keywords") or []
    keywords = [k for k in raw_kws if isinstance(k, str) and k in PRESET_KEYWORDS]
    vendor = data.get("vendor")
    if not isinstance(vendor, str) or not vendor.strip():
        vendor = None
    return {"intent": intent, "keywords": keywords, "vendor": vendor}
