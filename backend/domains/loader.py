"""Domain registry loader — reads JSON domain specs and provides matching."""
from __future__ import annotations

import json
import logging
import os
from pathlib import Path
from typing import Any, TypedDict

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Types
# ---------------------------------------------------------------------------

class ColumnSpec(TypedDict, total=False):
    name: str
    type: str
    pk: bool
    nullable: bool
    description: str


class SPParam(TypedDict, total=False):
    name: str
    type: str
    required: bool
    description: str


class SPSpec(TypedDict, total=False):
    name: str
    description: str
    params: list[SPParam]


class TableSpec(TypedDict, total=False):
    name: str
    table_group: str
    db_channel: int
    description: str
    columns: list[ColumnSpec]
    joins: list[dict[str, Any]]


class DomainSpec(TypedDict, total=False):
    domain: str
    display_name: str
    keywords: list[str]
    table_groups: dict[str, str]
    stored_procedures: list[SPSpec]
    tables: list[TableSpec]


# ---------------------------------------------------------------------------
# Loader
# ---------------------------------------------------------------------------

_cache: list[DomainSpec] = []


def load_all_domains(registry_dir: str | Path | None = None) -> list[DomainSpec]:
    """Load all .json domain files from the registry directory."""
    global _cache
    if _cache:
        return _cache

    if registry_dir is None:
        registry_dir = Path(__file__).parent

    registry_dir = Path(registry_dir)
    if not registry_dir.exists():
        logger.warning("Domain registry directory not found: %s", registry_dir)
        return []

    domains: list[DomainSpec] = []
    for f in sorted(registry_dir.glob("*.json")):
        try:
            with open(f, encoding="utf-8") as fh:
                spec = json.load(fh)
            domains.append(spec)
            tables_count = len(spec.get("tables", []))
            sp_count = len(spec.get("stored_procedures", []))
            logger.info(
                "Loaded domain '%s' (%s): %d tables, %d SPs",
                spec.get("domain"), f.name, tables_count, sp_count,
            )
        except Exception as exc:
            logger.error("Failed to load domain file %s: %s", f, exc)

    _cache = domains
    return domains


def match_domain(question: str, domains: list[DomainSpec] | None = None) -> DomainSpec | None:
    """Find the best matching domain for a user question via keyword scoring."""
    if domains is None:
        domains = load_all_domains()
    if not domains:
        return None

    q_lower = question.lower()
    best: DomainSpec | None = None
    best_score = 0

    for d in domains:
        score = sum(1 for kw in d.get("keywords", []) if kw.lower() in q_lower)
        if score > best_score:
            best_score = score
            best = d

    return best if best_score > 0 else None


def domain_to_context(domain: DomainSpec) -> str:
    """Convert a domain spec to a concise text block for system prompt injection."""
    lines: list[str] = []
    lines.append(f"## Available Database Schema: {domain.get('display_name', domain.get('domain', ''))}")
    lines.append("")

    # Table groups
    groups = domain.get("table_groups", {})
    if groups:
        lines.append("### Table Groups")
        for gid, desc in groups.items():
            lines.append(f"- **{gid}**: {desc}")
        lines.append("")

    # Stored procedures
    sps = domain.get("stored_procedures", [])
    if sps:
        lines.append("### Stored Procedures")
        for sp in sps:
            params_str = ", ".join(
                f"{p['name']} ({p.get('type', '?')}{'*' if p.get('required') else ''})"
                for p in sp.get("params", [])
            )
            lines.append(f"- `{sp['name']}({params_str})` — {sp.get('description', '')}")
        lines.append("")

    # Tables (compact: name + PK + key columns only)
    tables = domain.get("tables", [])
    if tables:
        lines.append("### Tables")
        for t in tables:
            cols = t.get("columns", [])
            pk_cols = [c["name"] for c in cols if c.get("pk")]
            # Show PK + first 8 described columns to keep token count manageable
            described = [c for c in cols if c.get("description")][:8]
            col_summary = ", ".join(
                f"{c['name']}({c.get('description', '')})" for c in described
            )
            pk_str = f" PK=[{','.join(pk_cols)}]" if pk_cols else ""
            group = t.get("table_group", "")
            lines.append(f"- `{t['name']}`{pk_str} [{group}]: {col_summary}")

        lines.append("")

    lines.append(
        "Use ONLY the tables and stored procedures listed above. "
        "If none match, use the `explore_schema` tool (requires user approval)."
    )
    return "\n".join(lines)


def get_domain_summary() -> str:
    """Return a brief summary of all loaded domains for the domain_lookup tool."""
    domains = load_all_domains()
    if not domains:
        return "No domains registered. Use explore_schema to inspect the database directly."

    lines = ["Available domains:"]
    for d in domains:
        tables = d.get("tables", [])
        sps = d.get("stored_procedures", [])
        groups = list(d.get("table_groups", {}).keys())
        lines.append(
            f"- {d['domain']} ({d.get('display_name', '')}): "
            f"{len(tables)} tables, {len(sps)} SPs, "
            f"groups: {', '.join(groups)}"
        )
    return "\n".join(lines)
