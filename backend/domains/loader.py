"""Domain registry v3 — loads schema_registry/domains/*.json files and directories."""
from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Module → Domain code mapping (fallback for keyword matching)
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

# ---------------------------------------------------------------------------
# Domain spec type (matches JSON structure from schema_registry)
# ---------------------------------------------------------------------------
# JSON structure (groupware.json 기준):
# {
#   "domain": "groupware",
#   "display_name": "그룹웨어",
#   "db": "GW",
#   "keywords": ["출근", "퇴근", ...],
#   "table_groups": {"attendance": "근태 — 출퇴근 기록"},
#   "stored_procedures": [{name, description, params: [{name, type, pk, description}]}],
#   "tables": [{name, table_group, description, columns: [{name, type, pk, description}], joins}]
# }

DomainSpec = dict[str, Any]

TABLE_PREFIX = "W"


def to_full_table_name(domain_cd: str, business_name: str) -> str:
    return f"{TABLE_PREFIX}{domain_cd}_{business_name}"


def parse_table_name(full_name: str) -> tuple[str, str] | None:
    """Extract (domain_cd, business_name) from full table name.
    e.g. 'WPM_WorkPrdMST' → ('PM', 'WorkPrdMST')
    Also handles TGW_ prefix: 'TGW_AttendList' → ('GW', 'AttendList')
    """
    for prefix in ("W", "T"):
        if full_name.startswith(prefix):
            rest = full_name[len(prefix):]
            parts = rest.split("_", 1)
            if len(parts) == 2:
                return parts[0], parts[1]
    return None


# ---------------------------------------------------------------------------
# Cache
# ---------------------------------------------------------------------------

_domains: list[DomainSpec] = []


def _registry_dir() -> Path:
    """Default: backend/schema_registry/domains/"""
    return Path(__file__).resolve().parent.parent / "schema_registry" / "domains"


def _load_directory_domain(dir_path: Path) -> DomainSpec:
    """Load domain from a directory with meta.json + tables.json + joins.json + stored_procedures.json."""
    meta_f = dir_path / "meta.json"
    if not meta_f.exists():
        raise FileNotFoundError(f"meta.json missing in domain directory '{dir_path.name}'")

    tables_f = dir_path / "tables.json"
    if not tables_f.exists():
        raise FileNotFoundError(f"tables.json missing in domain directory '{dir_path.name}'")

    with open(meta_f, encoding="utf-8") as fh:
        spec: DomainSpec = json.load(fh)

    with open(tables_f, encoding="utf-8") as fh:
        spec["tables"] = json.load(fh).get("tables", [])

    joins_f = dir_path / "joins.json"
    if joins_f.exists():
        with open(joins_f, encoding="utf-8") as fh:
            spec["joins"] = json.load(fh).get("joins", [])
    else:
        spec["joins"] = []

    sp_f = dir_path / "stored_procedures.json"
    if sp_f.exists():
        with open(sp_f, encoding="utf-8") as fh:
            spec["stored_procedures"] = json.load(fh).get("stored_procedures", [])
    else:
        spec["stored_procedures"] = []

    return spec


def load_all_domains(base_dir: str | Path | None = None) -> list[DomainSpec]:
    """Load all domain specs from schema_registry/domains/ (*.json files and directories)."""
    global _domains
    if _domains:
        return _domains

    d = Path(base_dir) if base_dir else _registry_dir()
    if not d.exists():
        logger.warning("Schema registry not found: %s", d)
        return []

    # Single-file domains (backward compat)
    for f in sorted(d.glob("*.json")):
        try:
            with open(f, encoding="utf-8") as fh:
                spec = json.load(fh)
            _domains.append(spec)
            logger.info(
                "Domain loaded: %s (%s) - %d tables, %d SPs from %s",
                spec.get("domain"),
                spec.get("display_name"),
                len(spec.get("tables", [])),
                len(spec.get("stored_procedures", [])),
                f.name,
            )
        except Exception as exc:
            logger.error("Failed to load %s: %s", f, exc)

    # Directory-based domains
    for sub in sorted(d.iterdir()):
        if sub.is_dir() and (sub / "meta.json").exists():
            try:
                spec = _load_directory_domain(sub)
                _domains.append(spec)
                logger.info(
                    "Domain loaded: %s (%s) - %d tables, %d joins, %d SPs from %s/",
                    spec.get("domain"),
                    spec.get("display_name"),
                    len(spec.get("tables", [])),
                    len(spec.get("joins", [])),
                    len(spec.get("stored_procedures", [])),
                    sub.name,
                )
            except Exception as exc:
                logger.error("Failed to load domain dir %s: %s", sub, exc)

    return _domains


def reload_all(base_dir: str | Path | None = None) -> list[DomainSpec]:
    global _domains
    _domains = []
    return load_all_domains(base_dir)


# ---------------------------------------------------------------------------
# Domain matching
# ---------------------------------------------------------------------------

def match_domain(question: str) -> DomainSpec | None:
    """Find best matching domain for a question via keyword scoring."""
    domains = load_all_domains()
    if not domains:
        return None

    q = question.lower()
    best: DomainSpec | None = None
    best_score = 0

    for d in domains:
        score = sum(1 for kw in d.get("keywords", []) if kw.lower() in q)
        # Also check display_name and domain name
        if d.get("display_name", "").lower() in q:
            score += 2
        if d.get("domain", "").lower() in q:
            score += 1
        if score > best_score:
            best_score = score
            best = d

    # Fallback: MODULE_DOMAIN_MAP keyword matching
    if best is None:
        for code, info in MODULE_DOMAIN_MAP.items():
            if info["ko"] in q or info["en"].lower() in q:
                # Return None — no registered domain, but we know the area
                break

    return best if best_score > 0 else None


# ---------------------------------------------------------------------------
# System prompt context builder
# ---------------------------------------------------------------------------

def domain_to_context(domain: DomainSpec) -> str:
    """Convert a domain spec to system prompt text."""
    lines: list[str] = []
    name = domain.get("display_name", domain.get("domain", ""))
    lines.append(f"## Available Database Schema: {name}")

    # Table groups
    groups = domain.get("table_groups", {})
    if groups:
        lines.append("\n### Table Groups")
        for gid, desc in groups.items():
            lines.append(f"- **{gid}**: {desc}")

    # Stored procedures
    sps = domain.get("stored_procedures", [])
    if sps:
        lines.append("\n### Stored Procedures (whitelisted)")
        for sp in sps:
            params = sp.get("params", [])
            param_str = ", ".join(
                f"`{p.get('name','')}` ({p.get('type','')}" +
                (", required" if p.get("required") else "") + ")"
                for p in params
            )
            lines.append(f"- **{sp['name']}** - {sp.get('description','')}")
            if param_str:
                lines.append(f"  Params: {param_str}")
            if sp.get("returns"):
                lines.append(f"  Returns: {sp['returns']}")

    # Tables (compact)
    tables = domain.get("tables", [])
    if tables:
        lines.append("\n### Tables")
        for t in tables:
            tname = t.get("name", "")
            tdesc = t.get("description", "")
            group = t.get("table_group", "")
            lines.append(f"\n**{tname}** [{group}] {f'- {tdesc}' if tdesc else ''}")

            cols = t.get("columns", [])
            if cols:
                # Show key columns (PK + first 10)
                pk_cols = [c for c in cols if c.get("pk")]
                other_cols = [c for c in cols if not c.get("pk")][:10]
                show = pk_cols + other_cols
                lines.append("| Column | Type | Description |")
                lines.append("|--------|------|-------------|")
                for c in show:
                    pk_mark = " (PK)" if c.get("pk") else ""
                    lines.append(
                        f"| {c['name']}{pk_mark} | {c.get('type','')} | {c.get('description','')} |"
                    )
                if len(cols) > len(show):
                    lines.append(f"| ... | | ({len(cols) - len(show)} more columns) |")

            joins = t.get("joins", [])
            if joins:
                lines.append("Joins:")
                for j in joins:
                    target = j.get("target", "")
                    on = j.get("on", "")
                    desc = j.get("description", "")
                    lines.append(f"- → {target} ON `{on}`" + (f" — {desc}" if desc else ""))

    # Top-level joins (directory-based domains, new schema)
    top_joins = domain.get("joins", [])
    if top_joins:
        from domains.parser import JOIN_TYPE_MAP

        lines.append("\n### Join Relationships")
        for j in top_joins:
            jtype = JOIN_TYPE_MAP.get(j.get("join_type", "L"), "LEFT")
            from_t = "dbo." + j["tables"][0]
            to_t = "dbo." + j["tables"][1]
            desc = j.get("description", "")
            from_cols = j["columns"][0]
            to_cols = j["columns"][1]
            operators = j.get("operators", [])
            on_parts = []
            for i in range(len(from_cols)):
                op = operators[i] if i < len(operators) else "="
                on_parts.append(f"{from_t}.{from_cols[i]} {op} {to_t}.{to_cols[i]}")
            on_str = " AND ".join(on_parts)
            lines.append(f"- {on_str} ({jtype})" + (f" -- {desc}" if desc else ""))
        lines.append("")
        lines.append("Use these join relationships when building queries that span multiple tables.")

    lines.append("")
    lines.append(
        "Use ONLY the tables and stored procedures listed above. "
        "Use `list_tables` tool ONLY if you need tables not listed here. "
        "After getting table/column info, ALWAYS proceed to query actual data with `db_query` or `sp_call`. "
        "When a query returns user IDs or customer codes, JOIN the master tables (LZXP310T for users, TCD_Customer for customers) "
        "to include the human-readable name alongside the code."
    )
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# SP whitelist (extracted from all domain JSONs)
# ---------------------------------------------------------------------------

def get_all_whitelisted_sp_names() -> set[str]:
    """Return all SP names from all loaded domains."""
    domains = load_all_domains()
    names: set[str] = set()
    for d in domains:
        for sp in d.get("stored_procedures", []):
            if sp.get("name"):
                names.add(sp["name"])
    return names


def is_sp_whitelisted(sp_name: str) -> bool:
    return sp_name in get_all_whitelisted_sp_names()


# ---------------------------------------------------------------------------
# API helpers
# ---------------------------------------------------------------------------

def get_domains_summary() -> list[dict]:
    """Return summary for GET /api/domains endpoint."""
    domains = load_all_domains()
    return [
        {
            "domain": d.get("domain", ""),
            "display_name": d.get("display_name", ""),
            "db": d.get("db", ""),
            "table_count": len(d.get("tables", [])),
            "join_count": len(d.get("joins", [])),
            "sp_count": len(d.get("stored_procedures", [])),
            "table_groups": list(d.get("table_groups", {}).keys()),
            "keywords": d.get("keywords", [])[:5],
        }
        for d in domains
    ]
