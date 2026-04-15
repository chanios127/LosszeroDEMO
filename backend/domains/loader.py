"""Domain registry v2 — domain_tables.json + sp_whitelist.json loader."""
from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Module -> Domain code mapping
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

TABLE_PREFIX = "W"


def to_full_table_name(domain_cd: str, business_name: str) -> str:
    return f"{TABLE_PREFIX}{domain_cd}_{business_name}"


def parse_table_name(full_name: str) -> tuple[str, str] | None:
    if not full_name.startswith(TABLE_PREFIX):
        return None
    rest = full_name[len(TABLE_PREFIX):]
    parts = rest.split("_", 1)
    if len(parts) != 2:
        return None
    return parts[0], parts[1]


# ---------------------------------------------------------------------------
# Caches
# ---------------------------------------------------------------------------

DomainRegistry = dict[str, Any]
SPWhitelist = dict[str, Any]

_tables_registry: DomainRegistry = {}
_sp_whitelist: SPWhitelist = {}


def _load_json(path: Path) -> dict:
    if not path.exists():
        return {}
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def load_registry(base_dir: str | Path | None = None) -> DomainRegistry:
    global _tables_registry
    if _tables_registry:
        return _tables_registry
    if base_dir is None:
        base_dir = Path(__file__).parent
    base_dir = Path(base_dir)
    _tables_registry = _load_json(base_dir / "domain_tables.json")
    total = sum(len(v.get("tables", {})) for v in _tables_registry.values())
    logger.info("Domain tables loaded: %d domains, %d tables", len(_tables_registry), total)
    return _tables_registry


def load_sp_whitelist(base_dir: str | Path | None = None) -> SPWhitelist:
    global _sp_whitelist
    if _sp_whitelist:
        return _sp_whitelist
    if base_dir is None:
        base_dir = Path(__file__).parent
    base_dir = Path(base_dir)
    _sp_whitelist = _load_json(base_dir / "sp_whitelist.json")
    total = sum(len(v.get("procedures", {})) for v in _sp_whitelist.values())
    logger.info("SP whitelist loaded: %d domains, %d procedures", len(_sp_whitelist), total)
    return _sp_whitelist


def reload_all(base_dir: str | Path | None = None):
    global _tables_registry, _sp_whitelist
    _tables_registry = {}
    _sp_whitelist = {}
    load_registry(base_dir)
    load_sp_whitelist(base_dir)


# ---------------------------------------------------------------------------
# SP whitelist helpers
# ---------------------------------------------------------------------------

def get_all_whitelisted_sp_names() -> set[str]:
    """Return all SP names from the whitelist."""
    wl = load_sp_whitelist()
    names: set[str] = set()
    for domain_info in wl.values():
        for sp_name in domain_info.get("procedures", {}):
            names.add(sp_name)
    return names


def is_sp_whitelisted(sp_name: str) -> bool:
    return sp_name in get_all_whitelisted_sp_names()


# ---------------------------------------------------------------------------
# Domain matching
# ---------------------------------------------------------------------------

def match_domains(question: str) -> list[str]:
    registry = load_registry()
    q = question.lower()
    matches: list[tuple[str, int]] = []

    for code, info in MODULE_DOMAIN_MAP.items():
        score = 0
        if info["ko"] in q:
            score += 2
        if info["en"].lower() in q:
            score += 1
        if code in registry:
            desc = registry[code].get("description", "")
            if desc and desc in q:
                score += 2
        if score > 0:
            matches.append((code, score))

    matches.sort(key=lambda x: -x[1])
    return [code for code, _ in matches]


# ---------------------------------------------------------------------------
# System prompt context builder
# ---------------------------------------------------------------------------

def get_domain_context(domain_codes: list[str] | None = None) -> str:
    registry = load_registry()
    sp_wl = load_sp_whitelist()

    if not registry and not sp_wl:
        return (
            "No domain registry loaded. Use the `list_tables` tool to discover "
            "available tables, then use `db_query` to query them."
        )

    if domain_codes is None or len(domain_codes) == 0:
        lines = ["## Registered Domains"]
        for code, info in registry.items():
            label = MODULE_DOMAIN_MAP.get(code, {}).get("ko", code)
            desc = info.get("description", label)
            table_count = len(info.get("tables", {}))
            lines.append(f"- **{code}** ({desc}): {table_count} tables")
        return "\n".join(lines)

    lines = ["## Available Database Schema"]

    for code in domain_codes:
        # Tables
        domain_info = registry.get(code, {})
        label = MODULE_DOMAIN_MAP.get(code, {}).get("ko", code)
        desc = domain_info.get("description", label)
        lines.append(f"\n### {code} - {desc}")

        tables = domain_info.get("tables", {})
        if tables:
            lines.append("\n#### Tables")
            for biz_name, tbl_info in tables.items():
                full_name = to_full_table_name(code, biz_name)
                tbl_desc = tbl_info.get("description", "")
                lines.append(f"\n**{full_name}** {f'- {tbl_desc}' if tbl_desc else ''}")
                columns = tbl_info.get("columns", {})
                if columns:
                    lines.append("| Column | Type | Title |")
                    lines.append("|--------|------|-------|")
                    for col_name, col_info in columns.items():
                        lines.append(f"| {col_name} | {col_info.get('type','')} | {col_info.get('title','')} |")

        # SPs
        sp_domain = sp_wl.get(code, {})
        procs = sp_domain.get("procedures", {})
        if procs:
            lines.append("\n#### Stored Procedures (whitelisted)")
            for sp_name, sp_info in procs.items():
                sp_desc = sp_info.get("description", "")
                params = sp_info.get("params", {})
                param_parts = []
                for pname, pinfo in params.items():
                    req = " *required*" if pinfo.get("required") else ""
                    param_parts.append(f"`{pname}` ({pinfo.get('type','')}{req}): {pinfo.get('title','')}")
                param_str = ", ".join(param_parts)
                returns = sp_info.get("returns", "")
                lines.append(f"- **{sp_name}** - {sp_desc}")
                if param_str:
                    lines.append(f"  - Params: {param_str}")
                if returns:
                    lines.append(f"  - Returns: {returns}")

    lines.append("")
    lines.append(
        "IMPORTANT: Use the tables and stored procedures listed above. "
        "Use `list_tables` tool ONLY if you need tables not listed here. "
        "After getting table/column info, ALWAYS proceed to query the actual data with `db_query` or `sp_call`."
    )
    return "\n".join(lines)


def get_all_domain_labels() -> dict[str, str]:
    return {code: info["ko"] for code, info in MODULE_DOMAIN_MAP.items()}
