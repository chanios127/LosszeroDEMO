"""Join-aware SQL SELECT builder for domain join definitions.

New joins schema (Phase 8):
    {
      "name": "...",
      "tables":  ["FromTable", "ToTable"],
      "join_type": "L",
      "columns": [["from_col1"], ["to_col1"]],
      "operators": ["="],
      "description": "..."
    }

Table names in the schema omit the ``dbo.`` prefix; this module prepends it
automatically in generated SQL.
"""
from __future__ import annotations

JOIN_TYPE_MAP: dict[str, str] = {
    "L": "LEFT",
    "R": "RIGHT",
    "I": "INNER",
    "C": "CROSS",
}

_SCHEMA_PREFIX = "dbo."


def build_select(
    joins: list[dict],
    select_cols: list[str] | None = None,
    use_alias: bool = True,
) -> str:
    """Build a SELECT ... FROM ... JOIN statement from a list of join definitions.

    Args:
        joins: List of join dicts using the new schema (``tables``, ``columns``,
               ``operators``, ``join_type``).
        select_cols: Columns to select.  ``None`` means ``SELECT *``.
        use_alias: When True, assign single-letter aliases (A, B, C ...).

    Raises:
        ValueError: If *joins* is empty or a from-table is not in the chain.
    """
    if not joins:
        raise ValueError("joins must be a non-empty list")

    # --- alias bookkeeping ---------------------------------------------------
    alias_map: dict[str, str] = {}  # dbo.Table → alias letter
    _next_ord = 65  # ord('A')

    def _get_or_assign(table: str) -> str:
        nonlocal _next_ord
        if table not in alias_map:
            alias_map[table] = chr(_next_ord)
            _next_ord += 1
        return alias_map[table]

    # Register base table (dbo-prefixed)
    base_table = _SCHEMA_PREFIX + joins[0]["tables"][0]
    _get_or_assign(base_table)

    # --- build JOIN clauses ---------------------------------------------------
    join_clauses: list[str] = []
    for idx, j in enumerate(joins):
        from_t = _SCHEMA_PREFIX + j["tables"][0]
        to_t = _SCHEMA_PREFIX + j["tables"][1]
        jtype_key = j.get("join_type", "L").upper()
        jtype = JOIN_TYPE_MAP.get(jtype_key, "LEFT")

        # Chain validation: from_table must already be known
        if from_t not in alias_map:
            raise ValueError(
                f"chain broken at index {idx}: "
                f"'{from_t}' not in prior tables {list(alias_map)}"
            )

        from_alias = _get_or_assign(from_t)
        to_alias = _get_or_assign(to_t)

        from_ref = from_alias if use_alias else from_t
        to_ref = to_alias if use_alias else to_t
        to_decl = f"{to_t} {to_alias}" if use_alias else to_t

        # CROSS JOIN has no ON clause
        if jtype_key == "C":
            join_clauses.append(f"CROSS JOIN {to_decl}")
            continue

        # ON clause from columns[0] / columns[1] / operators
        from_cols = j["columns"][0]
        to_cols = j["columns"][1]
        operators = j.get("operators", [])
        on_parts: list[str] = []
        for i in range(len(from_cols)):
            op = operators[i] if i < len(operators) else "="
            on_parts.append(f"{from_ref}.{from_cols[i]} {op} {to_ref}.{to_cols[i]}")

        on_str = " AND ".join(on_parts)
        join_clauses.append(f"{jtype} JOIN {to_decl} ON {on_str}")

    # --- SELECT + FROM --------------------------------------------------------
    select_part = "SELECT *" if select_cols is None else f"SELECT {', '.join(select_cols)}"
    base_decl = f"{base_table} {alias_map[base_table]}" if use_alias else base_table
    from_part = f"FROM {base_decl}"

    parts = [select_part, from_part] + join_clauses
    return "\n".join(parts)


# ---------------------------------------------------------------------------
# Self-test (run with: python -m domains.parser)
# ---------------------------------------------------------------------------

if __name__ == "__main__":

    def _run_tests() -> None:
        print("=== Case 1: 2-table, single col, = ===")
        sql = build_select([
            {"tables": ["Orders", "Customers"], "join_type": "L",
             "columns": [["CustID"], ["ID"]], "operators": ["="]},
        ])
        print(sql, "\n")
        assert "LEFT JOIN" in sql
        assert "dbo.Orders" in sql
        assert "dbo.Customers" in sql
        assert "A.CustID = B.ID" in sql

        print("=== Case 2: 3-table chain, <> operator ===")
        sql = build_select([
            {"tables": ["A_T", "B_T"], "join_type": "L",
             "columns": [["x"], ["y"]], "operators": ["="]},
            {"tables": ["B_T", "C_T"], "join_type": "L",
             "columns": [["m"], ["n"]], "operators": ["<>"]},
        ])
        print(sql, "\n")
        assert "LEFT JOIN dbo.B_T" in sql
        assert "LEFT JOIN dbo.C_T" in sql
        assert "<>" in sql

        print("=== Case 3: composite join (2 columns, AND) ===")
        sql = build_select([
            {"tables": ["X", "Y"], "join_type": "L",
             "columns": [["a", "b"], ["c", "d"]], "operators": ["=", "="]},
        ])
        print(sql, "\n")
        assert "AND" in sql
        assert "A.a = B.c" in sql
        assert "A.b = B.d" in sql

        print("=== Case 4: INNER / RIGHT / CROSS ===")
        sql = build_select([
            {"tables": ["P", "Q"], "join_type": "I",
             "columns": [["id"], ["pid"]], "operators": ["="]},
            {"tables": ["P", "R"], "join_type": "R",
             "columns": [["id"], ["pid"]], "operators": ["="]},
            {"tables": ["P", "S"], "join_type": "C",
             "columns": [[], []], "operators": []},
        ])
        print(sql, "\n")
        assert "INNER JOIN" in sql
        assert "RIGHT JOIN" in sql
        assert "CROSS JOIN" in sql
        assert "ON" not in sql.split("CROSS JOIN")[1].split("\n")[0]

        print("=== Case 5: use_alias=False ===")
        sql = build_select(
            [{"tables": ["Orders", "Customers"], "join_type": "L",
              "columns": [["CustID"], ["ID"]], "operators": ["="]}],
            use_alias=False,
        )
        print(sql, "\n")
        assert "dbo.Orders.CustID = dbo.Customers.ID" in sql
        assert " A " not in sql
        assert " B " not in sql

        print("=== Case 6 (bonus): chain broken -> ValueError ===")
        try:
            build_select([
                {"tables": ["A_T", "B_T"], "join_type": "L",
                 "columns": [["x"], ["y"]], "operators": ["="]},
                {"tables": ["Z_T", "C_T"], "join_type": "L",
                 "columns": [["m"], ["n"]], "operators": ["="]},
            ])
            assert False, "Should have raised ValueError"
        except ValueError as e:
            print(f"Correctly raised: {e}\n")

        print("=== Case 7 (bonus): old schema -> KeyError ===")
        try:
            build_select([
                {"from_table": "dbo.Orders", "to_table": "dbo.Customers",
                 "join_type": "L", "from_columns": ["CustID"],
                 "to_columns": ["ID"], "operators": ["="]},
            ])
            assert False, "Should have raised KeyError"
        except KeyError as e:
            print(f"Correctly raised KeyError for old schema: {e}\n")

        print("All tests passed.")

    _run_tests()
