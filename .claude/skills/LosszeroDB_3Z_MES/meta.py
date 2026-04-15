"""
LossZero 메타데이터 조회 모듈

DB0(Base)의 LzDxpColumnLayoutInfo 기준으로 표준/전용 객체를 판별하고,
채널별 테이블·프로시저·함수·트리거 목록을 반환한다.

Claude 스킬에서 직접 import해서 사용:
    from meta import column_info, find_object, is_standard_table, proc_list

CLI 사용:
    python meta.py column_info LzDxp140T
    python meta.py table_list --db 1
    python meta.py standard_tables
    python meta.py proc_list --db 1 --pattern LzDxp
    python meta.py find_object LzDxp140T
"""

import sys
import argparse
from connect import get_connection, list_channels

# DB0의 표준 테이블 목록 캐시 (세션 내 재사용)
_standard_table_cache: set[str] | None = None


# ─────────────────────────────────────────────
# 1. 표준 테이블 판별
# ─────────────────────────────────────────────

def standard_tables() -> list[str]:
    """DB0 LzDxpColumnLayoutInfo에 등록된 표준 테이블 목록 반환"""
    global _standard_table_cache
    if _standard_table_cache is not None:
        return sorted(_standard_table_cache)

    conn = get_connection(0)
    try:
        cur = conn.cursor()
        cur.execute("SELECT TableNm FROM LzDxpColumnLayoutInfo GROUP BY TableNm")
        _standard_table_cache = {row[0] for row in cur.fetchall()}
        return sorted(_standard_table_cache)
    finally:
        conn.close()


def is_standard_table(table_name: str) -> bool:
    """테이블이 DB0 표준 테이블이면 True"""
    return table_name in set(standard_tables())


def resolve_table_channel(table_name: str) -> int:
    """
    테이블명으로 적절한 채널 번호 반환.
    - LzDxpColumnLayoutInfo 등재 → 0 (Base)
    - 미등재 → 1 (Logic, 기본값)
    """
    return 0 if is_standard_table(table_name) else 1


# ─────────────────────────────────────────────
# 2. 컬럼 레이아웃 조회 (DB0 기준 표준 스키마)
# ─────────────────────────────────────────────

_SQL_DATATYPE = """
    CASE b.system_type_id
        WHEN  34 THEN 'image'           WHEN  35 THEN 'text'
        WHEN  36 THEN 'uniqueidentifier' WHEN  40 THEN 'date'
        WHEN  41 THEN 'time'            WHEN  42 THEN 'datetime2'
        WHEN  43 THEN 'datetimeoffset'  WHEN  48 THEN 'tinyint'
        WHEN  52 THEN 'smallint'        WHEN  56 THEN 'integer'
        WHEN  58 THEN 'smalldatetime'   WHEN  59 THEN 'real'
        WHEN  60 THEN 'money'           WHEN  61 THEN 'datetime'
        WHEN  62 THEN 'float'           WHEN  99 THEN 'ntext'
        WHEN 104 THEN 'bit'             WHEN 106 THEN 'decimal'
        WHEN 108 THEN 'numeric'         WHEN 122 THEN 'smallmoney'
        WHEN 127 THEN 'bigint'          WHEN 165 THEN 'varbinary'
        WHEN 167 THEN 'varchar'         WHEN 173 THEN 'binary'
        WHEN 175 THEN 'char'            WHEN 189 THEN 'timestamp'
        WHEN 231 THEN 'nvarchar'        WHEN 239 THEN 'nchar'
    END +
    CASE
        WHEN b.system_type_id IN (231,239) THEN '(' + CONVERT(varchar, b.max_length) + ')'
        WHEN b.system_type_id IN (165,167,173,175) THEN '(' + CONVERT(varchar, b.max_length) + ')'
        WHEN b.system_type_id IN (106,108) THEN '(' + CONVERT(varchar, b.precision) + ',' + CONVERT(varchar, b.scale) + ')'
        ELSE ''
    END
"""

# Dxp_ColumnLayoutInfoView 프로시저 로직을 CTE로 재현 (임시 테이블 없이 단일 SELECT)
_SQL_COLUMN_INFO_STANDARD = f"""
WITH IndexInfo AS (
    SELECT d.name AS column_name, b.type_desc AS index_type
    FROM sys.tables a
    JOIN sys.indexes       b ON a.object_id = b.object_id
    JOIN sys.index_columns c ON b.object_id = c.object_id AND b.index_id  = c.index_id
    JOIN sys.columns       d ON c.object_id = d.object_id AND c.column_id = d.column_id
    WHERE a.name = ?
)
SELECT
    A.TableNm,
    B.Name                                                              AS ColumnNm,
    A.ColumnTitle,
    B.Column_ID                                                         AS SeqNo,
    {_SQL_DATATYPE}                                                     AS DataType,
    CASE B.is_nullable WHEN 1 THEN 'Y' ELSE 'N' END                    AS AllowNULL,
    A.ComboCd,
    MAX(CASE WHEN I.index_type = 'CLUSTERED'    THEN 'Y' ELSE '' END)  AS PK,
    CONVERT(varchar(10), NULL)                                          AS FK,
    MAX(CASE WHEN I.index_type = 'NONCLUSTERED' THEN 'Y' ELSE '' END)  AS IDX,
    A.Comment,
    A.Remark,
    A.UseFg
FROM LzDxpColumnLayoutInfo A
LEFT JOIN sys.columns B
    ON OBJECT_ID(A.TableNm) = B.object_id AND A.ColumnNm = B.Name
LEFT JOIN IndexInfo I
    ON B.Name = I.column_name
WHERE A.TableNm = ?
GROUP BY
    A.TableNm, B.Name, A.ColumnTitle, B.Column_ID,
    B.system_type_id, B.max_length, B.precision, B.scale, B.is_nullable,
    A.ComboCd, A.Comment, A.Remark, A.UseFg
ORDER BY SeqNo
"""

_SQL_COLUMN_INFO_CUSTOM = f"""
WITH IndexInfo AS (
    SELECT d.name AS column_name, b.type_desc AS index_type
    FROM sys.tables a
    JOIN sys.indexes       b ON a.object_id = b.object_id
    JOIN sys.index_columns c ON b.object_id = c.object_id AND b.index_id  = c.index_id
    JOIN sys.columns       d ON c.object_id = d.object_id AND c.column_id = d.column_id
    WHERE a.name = ?
)
SELECT
    o.name                                                              AS TableNm,
    B.name                                                              AS ColumnNm,
    CONVERT(nvarchar(100), NULL)                                        AS ColumnTitle,
    B.column_id                                                         AS SeqNo,
    {_SQL_DATATYPE}                                                     AS DataType,
    CASE B.is_nullable WHEN 1 THEN 'Y' ELSE 'N' END                    AS AllowNULL,
    CONVERT(varchar(50), NULL)                                          AS ComboCd,
    MAX(CASE WHEN I.index_type = 'CLUSTERED'    THEN 'Y' ELSE '' END)  AS PK,
    CONVERT(varchar(10), NULL)                                          AS FK,
    MAX(CASE WHEN I.index_type = 'NONCLUSTERED' THEN 'Y' ELSE '' END)  AS IDX,
    CONVERT(nvarchar(200), NULL)                                        AS Comment,
    CONVERT(nvarchar(200), NULL)                                        AS Remark,
    CONVERT(varchar(1),  NULL)                                          AS UseFg
FROM sys.columns B
JOIN sys.objects o ON B.object_id = o.object_id
LEFT JOIN IndexInfo I ON B.name = I.column_name
WHERE o.name = ?
GROUP BY
    o.name, B.name, B.column_id,
    B.system_type_id, B.max_length, B.precision, B.scale, B.is_nullable
ORDER BY SeqNo
"""


def column_info(table_name: str, db: int | None = None) -> list[dict]:
    """
    테이블의 컬럼 정의를 반환. Dxp_ColumnLayoutInfoView 프로시저 로직 기반.

    - 표준 테이블 (LzDxpColumnLayoutInfo 등재):
        DB0에서 ColumnTitle, DataType, AllowNULL, ComboCd, PK, IDX 포함 반환
    - 전용 테이블:
        db 파라미터 채널(기본 1)에서 sys.columns 기반 물리 스키마 반환
        (ColumnTitle, ComboCd 등 메타 필드는 NULL)
    """
    if db is None:
        db = 0 if is_standard_table(table_name) else 1

    if db == 0:
        conn = get_connection(0)
        sql = _SQL_COLUMN_INFO_STANDARD
        params = (table_name, table_name)  # CTE + WHERE 각 1회
    else:
        conn = get_connection(db)
        sql = _SQL_COLUMN_INFO_CUSTOM
        params = (table_name, table_name)

    try:
        cur = conn.cursor()
        cur.execute(sql, params)
        cols = [d[0] for d in cur.description]
        return [dict(zip(cols, row)) for row in cur.fetchall()]
    finally:
        conn.close()


# ─────────────────────────────────────────────
# 3. 테이블 목록
# ─────────────────────────────────────────────

def table_list(db: int = 1, pattern: str = "") -> list[str]:
    """지정 채널의 테이블 목록 반환. pattern은 LIKE 검색 (빈값=전체)"""
    conn = get_connection(db)
    try:
        cur = conn.cursor()
        if pattern:
            cur.execute(
                "SELECT name FROM sys.tables WHERE name LIKE ? ORDER BY name",
                f"%{pattern}%"
            )
        else:
            cur.execute("SELECT name FROM sys.tables ORDER BY name")
        return [row[0] for row in cur.fetchall()]
    finally:
        conn.close()


# ─────────────────────────────────────────────
# 4. 프로시저 / 함수 / 트리거 목록
# ─────────────────────────────────────────────

OBJECT_TYPES = {
    "procedure": "P",
    "proc":      "P",
    "function":  "FN",
    "fn":        "FN",
    "trigger":   "TR",
    "tr":        "TR",
}


def proc_list(db: int = 1, object_type: str = "procedure", pattern: str = "") -> list[dict]:
    """
    지정 채널의 프로시저/함수/트리거 목록 반환.
    object_type: procedure | function | trigger (기본: procedure)
    """
    type_code = OBJECT_TYPES.get(object_type.lower(), "P")
    conn = get_connection(db)
    try:
        cur = conn.cursor()
        if pattern:
            cur.execute("""
                SELECT name, type_desc, create_date, modify_date
                FROM sys.objects
                WHERE type = ? AND name LIKE ?
                ORDER BY name
            """, type_code, f"%{pattern}%")
        else:
            cur.execute("""
                SELECT name, type_desc, create_date, modify_date
                FROM sys.objects
                WHERE type = ?
                ORDER BY name
            """, type_code)
        cols = [d[0] for d in cur.description]
        return [dict(zip(cols, row)) for row in cur.fetchall()]
    finally:
        conn.close()


# ─────────────────────────────────────────────
# 5. 객체 채널 탐색 (어느 DB에 있는지)
# ─────────────────────────────────────────────

def find_object(name: str) -> list[dict]:
    """
    테이블/프로시저/함수 이름으로 설정된 모든 채널을 탐색.
    반환: [{"channel": 0, "type": "TABLE", "name": "..."}, ...]
    """
    results = []
    channels = list_channels()

    for info in channels:
        ch = info["channel"]
        conn = get_connection(ch)
        try:
            cur = conn.cursor()
            cur.execute("""
                SELECT name, type_desc
                FROM sys.objects
                WHERE name LIKE ? AND type IN ('U','P','FN','TR','V')
                ORDER BY type_desc, name
            """, f"%{name}%")
            for row in cur.fetchall():
                results.append({
                    "channel": ch,
                    "label": info["label"],
                    "name": row[0],
                    "type": row[1],
                })
        finally:
            conn.close()

    return results


# ─────────────────────────────────────────────
# CLI 진입점
# ─────────────────────────────────────────────

def _print_rows(rows: list, cols: list = None):
    if not rows:
        print("(결과 없음)")
        return
    if isinstance(rows[0], dict):
        cols = list(rows[0].keys())
        data = [[str(r.get(c, "")) for c in cols] for r in rows]
    else:
        data = [[str(v) for v in row] for row in rows]

    widths = [len(c) for c in cols]
    for row in data:
        for i, v in enumerate(row):
            widths[i] = max(widths[i], len(v))

    sep = "+" + "+".join("-" * (w + 2) for w in widths) + "+"
    hdr = "|" + "|".join(f" {c:<{w}} " for c, w in zip(cols, widths)) + "|"
    print(sep); print(hdr); print(sep)
    for row in data:
        print("|" + "|".join(f" {v:<{w}} " for v, w in zip(row, widths)) + "|")
    print(sep)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="LossZero 메타데이터 조회")
    sub = parser.add_subparsers(dest="cmd")

    # column_info
    p1 = sub.add_parser("column_info", help="테이블 컬럼 정의 조회")
    p1.add_argument("table", help="테이블명")

    # table_list
    p2 = sub.add_parser("table_list", help="채널별 테이블 목록")
    p2.add_argument("--db", default="1", help="채널 번호 (기본: 1)")
    p2.add_argument("--pattern", default="", help="LIKE 검색 패턴")

    # standard_tables
    sub.add_parser("standard_tables", help="표준 테이블 목록 (DB0 기준)")

    # proc_list
    p3 = sub.add_parser("proc_list", help="프로시저/함수/트리거 목록")
    p3.add_argument("--db", default="1", help="채널 번호 (기본: 1)")
    p3.add_argument("--type", default="procedure", help="procedure|function|trigger")
    p3.add_argument("--pattern", default="", help="이름 LIKE 검색")

    # find_object
    p4 = sub.add_parser("find_object", help="객체를 모든 채널에서 탐색")
    p4.add_argument("name", help="검색할 이름 (부분 일치)")

    args = parser.parse_args()

    if args.cmd == "column_info":
        rows = column_info(args.table)
        if rows:
            _print_rows(rows)
        else:
            print(f"[WARN] '{args.table}' 컬럼 정보 없음")

    elif args.cmd == "table_list":
        tables = table_list(int(args.db), args.pattern)
        print(f"[CH{args.db}] {len(tables)}개 테이블")
        for t in tables:
            marker = " *" if is_standard_table(t) else ""
            print(f"  {t}{marker}")

    elif args.cmd == "standard_tables":
        tables = standard_tables()
        print(f"[DB0 표준 테이블] {len(tables)}개")
        for t in tables:
            print(f"  {t}")

    elif args.cmd == "proc_list":
        rows = proc_list(int(args.db), args.type, args.pattern)
        print(f"[CH{args.db}] {len(rows)}개 {args.type}")
        _print_rows(rows)

    elif args.cmd == "find_object":
        results = find_object(args.name)
        if not results:
            print(f"'{args.name}' 을(를) 어느 채널에서도 찾지 못했습니다.")
        else:
            _print_rows(results)

    else:
        parser.print_help()
