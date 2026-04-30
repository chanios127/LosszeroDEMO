"""SKILL/rules loader — startup에 collect + system prompt 합성.

Phase 10 Step 3 — Theme 1·2·3·5 (프롬프트 자산 표준화) 해소.

자산 위치:
- ``backend/prompts/system_base.md``: 다이어트된 core anti-hallucination + 응답 언어 + name resolution + 시각화 + report pipeline 가이드
- ``backend/prompts/rules/<name>.md``: cross-cutting rule (applies_to: [system_prompt])
- ``backend/tools/<tool>/SKILL.md``: 도구별 description + rules + guards + errors (applies_to에 따라 라우팅)
- ``backend/tools/<sub_agent>/system.md``: sub-agent 자체 system message (SKILL frontmatter sub_agent_system 인용)

frontmatter는 minimal regex parser 사용 (PyYAML 의존 회피).
"""
from __future__ import annotations

import re
from functools import lru_cache
from pathlib import Path
from typing import TypedDict

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

_PROMPTS_DIR = Path(__file__).resolve().parent
_BACKEND_DIR = _PROMPTS_DIR.parent
_TOOLS_DIR = _BACKEND_DIR / "tools"
_RULES_DIR = _PROMPTS_DIR / "rules"
_SYSTEM_BASE = _PROMPTS_DIR / "system_base.md"


# ---------------------------------------------------------------------------
# Skill record
# ---------------------------------------------------------------------------

class Skill(TypedDict):
    name: str
    type: str                       # tool | sub_agent | rule
    version: int
    applies_to: list[str]           # tool_description | system_prompt_addendum | system_prompt
    required_rules: list[str]
    referenced_by: list[str]
    sub_agent_system: str | None    # relative path to sub-agent system.md
    body: str
    path: Path


# ---------------------------------------------------------------------------
# Frontmatter parser (minimal — supports key:value, key:[a,b], indented "  - x" lists)
# ---------------------------------------------------------------------------

_FM_RE = re.compile(r"^---\s*\n(.*?)\n---\s*\n(.*)", re.DOTALL)


def parse_frontmatter(text: str) -> tuple[dict, str]:
    """Return ``(frontmatter_dict, body)``.

    Returns ``({}, text)`` if the document has no leading frontmatter block.
    """
    m = _FM_RE.match(text)
    if not m:
        return {}, text
    raw_fm, body = m.group(1), m.group(2)
    fm: dict = {}
    cur_key: str | None = None
    for line in raw_fm.splitlines():
        # Indented list item under the previous key
        if re.match(r"^\s+-\s+", line):
            item = re.sub(r"^\s+-\s+", "", line).strip()
            if cur_key:
                existing = fm.get(cur_key)
                if isinstance(existing, list):
                    existing.append(item)
                else:
                    fm[cur_key] = [item]
            continue
        if ":" not in line:
            continue
        key, _, val = line.partition(":")
        key = key.strip()
        val = val.strip()
        cur_key = key
        if val == "":
            # Either an empty list (followed by indented items) or an explicit None
            fm[key] = []
        elif val.startswith("[") and val.endswith("]"):
            inner = val[1:-1].strip()
            fm[key] = (
                [s.strip() for s in inner.split(",") if s.strip()] if inner else []
            )
        else:
            fm[key] = val
    return fm, body.strip()


def _as_list(val) -> list[str]:
    if val is None:
        return []
    if isinstance(val, list):
        return [str(v) for v in val]
    return [str(val)]


def load_skill(path: Path) -> Skill:
    """Read a SKILL.md / rules/*.md file and return a structured Skill record."""
    text = path.read_text(encoding="utf-8")
    fm, body = parse_frontmatter(text)
    try:
        version = int(fm.get("version", 1))
    except (TypeError, ValueError):
        version = 1
    return Skill(
        name=str(fm.get("name", path.stem)),
        type=str(fm.get("type", "tool")),
        version=version,
        applies_to=_as_list(fm.get("applies_to")),
        required_rules=_as_list(fm.get("required_rules")),
        referenced_by=_as_list(fm.get("referenced_by")),
        sub_agent_system=(fm.get("sub_agent_system") or None),
        body=body,
        path=path,
    )


# ---------------------------------------------------------------------------
# Bulk collectors
# ---------------------------------------------------------------------------

def load_all_rules() -> dict[str, Skill]:
    """``prompts/rules/*.md`` → {name: Skill}.  Skipped if dir missing."""
    out: dict[str, Skill] = {}
    if not _RULES_DIR.is_dir():
        return out
    for p in sorted(_RULES_DIR.glob("*.md")):
        s = load_skill(p)
        out[s["name"]] = s
    return out


def load_all_tool_skills() -> dict[str, Skill]:
    """``tools/<tool>/SKILL.md`` → {name: Skill}."""
    out: dict[str, Skill] = {}
    if not _TOOLS_DIR.is_dir():
        return out
    for skill_path in sorted(_TOOLS_DIR.glob("*/SKILL.md")):
        s = load_skill(skill_path)
        out[s["name"]] = s
    return out


# ---------------------------------------------------------------------------
# Body section extraction (## Section headers)
# ---------------------------------------------------------------------------

def _extract_section(body: str, section: str) -> str | None:
    """Return content of the ``## <section>`` block (heading stripped), or None."""
    pattern = rf"(?:^|\n)##\s+{re.escape(section)}\s*\n(.*?)(?=\n##\s|\Z)"
    m = re.search(pattern, body, re.DOTALL | re.IGNORECASE)
    return m.group(1).strip() if m else None


# Sections from a tool SKILL.md body that should appear in the system prompt
# addendum. Description is excluded — it is surfaced via the OpenAI tool
# schema instead. Examples are excluded — they belong in tool-specific
# documentation, not the always-on system prompt.
_ADDENDUM_SECTIONS: tuple[str, ...] = ("Rules", "Guards", "Errors")


def _render_tool_addendum(skill: Skill) -> str:
    """Format the per-tool addendum that gets concatenated into the system prompt."""
    chunks: list[str] = []
    for name in _ADDENDUM_SECTIONS:
        content = _extract_section(skill["body"], name)
        if content:
            chunks.append(f"### {name}\n{content}")
    if not chunks:
        return ""
    return f"## Tool: {skill['name']}\n\n" + "\n\n".join(chunks)


# ---------------------------------------------------------------------------
# Public API — system prompt + per-tool description + sub-agent system
# ---------------------------------------------------------------------------

@lru_cache(maxsize=1)
def build_system_prompt() -> str:
    """Compose the full base system prompt: system_base + rules + tool addenda.

    Cached: cleared automatically on process restart. Files are scanned once
    per process, so editing a SKILL/rule requires a backend restart to take
    effect.
    """
    parts: list[str] = []
    if _SYSTEM_BASE.exists():
        parts.append(_SYSTEM_BASE.read_text(encoding="utf-8").strip())

    # Cross-cutting rules (applies_to includes "system_prompt")
    for rule in load_all_rules().values():
        if "system_prompt" in rule["applies_to"]:
            parts.append(rule["body"])

    # Per-tool addenda (applies_to includes "system_prompt_addendum")
    for tool in load_all_tool_skills().values():
        if "system_prompt_addendum" in tool["applies_to"]:
            chunk = _render_tool_addendum(tool)
            if chunk:
                parts.append(chunk)

    return "\n\n".join(p for p in parts if p)


@lru_cache(maxsize=None)
def get_tool_description(tool_name: str) -> str:
    """SKILL.md ``## Description`` 섹션 본문 — OpenAI tool schema의 description.

    Falls back to the full body if the file is present but lacks the heading,
    or to ``""`` if no SKILL.md exists for the tool.
    """
    skill_path = _TOOLS_DIR / tool_name / "SKILL.md"
    if not skill_path.exists():
        return ""
    s = load_skill(skill_path)
    return _extract_section(s["body"], "Description") or s["body"]


@lru_cache(maxsize=None)
def get_subagent_system(tool_name: str) -> str:
    """Read the sub-agent ``system.md`` referenced by SKILL.md frontmatter.

    Returns ``""`` if the tool has no SKILL.md or no ``sub_agent_system``
    declaration. Path is resolved relative to the SKILL.md file.
    """
    skill_path = _TOOLS_DIR / tool_name / "SKILL.md"
    if not skill_path.exists():
        return ""
    s = load_skill(skill_path)
    rel = s.get("sub_agent_system")
    if not rel:
        return ""
    full = (skill_path.parent / rel).resolve()
    if not full.exists():
        return ""
    return full.read_text(encoding="utf-8").strip()


def clear_cache() -> None:
    """Drop the in-process caches — useful for tests that mutate skill files."""
    build_system_prompt.cache_clear()
    get_tool_description.cache_clear()
    get_subagent_system.cache_clear()
