"""Domain registry v2 — simple JSON-based domain/table mapping."""
from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Module → Domain code mapping
# ---------------------------------------------------------------------------

MODULE_DOMAIN_MAP: dict[str, dict[str, str]] = {
    "AA":  {"ko": "공통",           "en": "Common"},
    "CD":  {"ko": "기준정보",       "en": "MasterData"},
    "SL":  {"ko": "영업",           "en": "Sales"},
    "PO":  {"ko": "구매",           "en": "Purchase"},
    "MT":  {"ko": "자재",           "en": "Material"},
    "PM":  {"ko": "생산",           "en": "Production"},
    "MM":  {"ko": "MPS/MRP",        "en": "Planning"},
    "QC":  {"ko": "품질",           "en": "Quality"},
    "QD":  {"ko": "품질관리대장",   "en": "QualityLedger"},
    "CS":  {"ko": "고객지원",       "en": "CustomerService"},
    "RD":  {"ko": "개발",           "en": "Development"},
    "TR":  {"ko": "무역",           "en": "Trade"},
    "CO":  {"ko": "원가",           "en": "Cost"},
    "HR":  {"ko": "인사",           "en": "HR"},
    "AC":  {"ko": "회계",           "en": "Accounting"},
    "AF":  {"ko": "회계연동",       "en": "AccountingIF"},
    "FA":  {"ko": "회계관리항목",   "en": "AccountingItem"},
    "AT":  {"ko": "부가세신고",     "en": "Tax"},
    "GW":  {"ko": "그룹웨어",       "en": "Groupware"},
    "US":  {"ko": "사용자콤보",     "en": "UserDefined"},
    "ZZ":  {"ko": "기타",           "en": "Misc"},
    "LOG": {"ko": "로그",           "en": "Log"},
    "DXP": {"ko": "시스템",         "en": "System"},
}

# Table fullname = "W" + domainCd + "_" + businessName
TABLE_PREFIX = "W"


def to_full_table_name(domain_cd: str, business_name: str) -> str:
    """Convert domain code + business name to full table name.
    e.g. ('PM', 'WorkPrdMST') → 'WPM_WorkPrdMST'
    """
    return f"{TABLE_PREFIX}{domain_cd}_{business_name}"


def parse_table_name(full_name: str) -> tuple[str, str] | None:
    """Extract (domain_cd, business_name) from a full table name.
    e.g. 'WPM_WorkPrdMST' → ('PM', 'WorkPrdMST')
    Returns None if the name doesn't match the pattern.
    """
    if not full_name.startswith(TABLE_PREFIX):
        return None
    rest = full_name[len(TABLE_PREFIX):]
    parts = rest.split("_", 1)
    if len(parts) != 2:
        return None
    return parts[0], parts[1]


# ---------------------------------------------------------------------------
# Registry types (simple dict-based, matches JSON structure)
# ---------------------------------------------------------------------------

# JSON structure:
# {
#   "PM": {
#     "description": "생산",
#     "tables": {
#       "WorkPrdMST": {
#         "description": "작업실적 마스터",
#         "columns": {
#           "woID": {"type": "int", "title": "작업지시ID"},
#           "workDt": {"type": "date", "title": "작업일자"}
#         }
#       }
#     }
#   }
# }

DomainRegistry = dict[str, Any]  # domainCd → {description, tables: {...}}

_registry: DomainRegistry = {}


def load_registry(path: str | Path | None = None) -> DomainRegistry:
    """Load domain_registry.json. Returns cached if already loaded."""
    global _registry
    if _registry:
        return _registry

    if path is None:
        path = Path(__file__).parent / "domain_registry.json"
    path = Path(path)

    if not path.exists():
        logger.warning("Domain registry not found: %s", path)
        return {}

    try:
        with open(path, encoding="utf-8") as f:
            _registry = json.load(f)
        total_tables = sum(
            len(v.get("tables", {})) for v in _registry.values()
        )
        logger.info(
            "Domain registry loaded: %d domains, %d tables from %s",
            len(_registry), total_tables, path.name,
        )
    except Exception as exc:
        logger.error("Failed to load domain registry: %s", exc)

    return _registry


def reload_registry(path: str | Path | None = None) -> DomainRegistry:
    """Force reload the registry (clear cache first)."""
    global _registry
    _registry = {}
    return load_registry(path)


# ---------------------------------------------------------------------------
# Query helpers
# ---------------------------------------------------------------------------

def match_domains(question: str) -> list[str]:
    """Find matching domain codes based on Korean keywords in the question.
    Returns list of domain codes sorted by relevance.
    """
    registry = load_registry()
    q = question.lower()
    matches: list[tuple[str, int]] = []

    for code, info in MODULE_DOMAIN_MAP.items():
        score = 0
        if info["ko"] in q:
            score += 2
        if info["en"].lower() in q:
            score += 1
        # Also check if domain is in registry and has tables
        if code in registry:
            desc = registry[code].get("description", "")
            if desc and desc in q:
                score += 2
        if score > 0:
            matches.append((code, score))

    matches.sort(key=lambda x: -x[1])
    return [code for code, _ in matches]


def get_domain_context(domain_codes: list[str] | None = None) -> str:
    """Build system prompt context from registry for given domain codes.
    If domain_codes is None, returns a summary of all domains.
    """
    registry = load_registry()

    if not registry:
        return (
            "No domain registry loaded. Use the `list_tables` tool to discover "
            "available tables, then use `db_query` to query them."
        )

    if domain_codes is None or len(domain_codes) == 0:
        # Summary of all registered domains
        lines = ["## Registered Domains"]
        for code, info in registry.items():
            label = MODULE_DOMAIN_MAP.get(code, {}).get("ko", code)
            desc = info.get("description", label)
            table_count = len(info.get("tables", {}))
            lines.append(f"- **{code}** ({desc}): {table_count} tables")
        return "\n".join(lines)

    # Detailed context for specific domains
    lines = ["## Available Database Schema"]
    for code in domain_codes:
        domain_info = registry.get(code)
        if not domain_info:
            continue

        label = MODULE_DOMAIN_MAP.get(code, {}).get("ko", code)
        desc = domain_info.get("description", label)
        lines.append(f"\n### {code} — {desc}")

        tables = domain_info.get("tables", {})
        for biz_name, tbl_info in tables.items():
            full_name = to_full_table_name(code, biz_name)
            tbl_desc = tbl_info.get("description", "")
            lines.append(f"\n**{full_name}** {f'— {tbl_desc}' if tbl_desc else ''}")

            columns = tbl_info.get("columns", {})
            if columns:
                lines.append("| Column | Type | Title |")
                lines.append("|--------|------|-------|")
                for col_name, col_info in columns.items():
                    col_type = col_info.get("type", "")
                    col_title = col_info.get("title", "")
                    lines.append(f"| {col_name} | {col_type} | {col_title} |")

    lines.append("")
    lines.append(
        "Use ONLY the tables listed above when possible. "
        "If you need tables not listed here, use the `list_tables` tool first."
    )
    return "\n".join(lines)


def get_all_domain_labels() -> dict[str, str]:
    """Return {domainCd: '한글명'} for all known domains."""
    return {code: info["ko"] for code, info in MODULE_DOMAIN_MAP.items()}
