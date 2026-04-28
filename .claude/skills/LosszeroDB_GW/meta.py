"""
LossZero GW 메타데이터 조회 모듈 (단일 DB)

GW DB의 TXP_TableInfo / TXP_ColumnInfo 기반으로 스키마를 조회한다.
XP_TableUsedInfo SP 로직을 파라미터화된 SELECT로 재현.

Claude 스킬에서 직접 import:
    from meta import table_list, column_info, find_object

CLI 사용:
    python meta.py table_list [--pattern FOO]
    python meta.py column_info TableName
    python meta.py find_object keyword
"""

import sys
import argparse
from connect import get_connection


# ─────────────────────────────────────────────
# 1. 테이블 목록 (TXP_TableInfo 기반)
# ─────────────────────────────────────────────

def table_list(pattern: str = "") -> list[dict]:
    """
    TXP_TableInfo에서 테이블 목록 반환.
    반환 필드: TableNm, Module, RowCnt, UseFg
    """
    conn = get_connection()
    try:
        cur = conn.cursor()
        if pattern:
            cur.execute("""
                SELECT ti_TableNm, ti_Module, ti_RowCnt, ti_UseFg
                FROM TXP_TableInfo
                WHERE ti_TableNm LIKE ? AND ti_UseFg = 'Y'
                ORDER BY ti_Module, ti_TableNm
            """, f"%{pattern}%")
        else:
            cur.execute("""
                SELECT ti_TableNm, ti_Module, ti_RowCnt, ti_UseFg
                FROM TXP_TableInfo
                WHERE ti_UseFg = 'Y'
                ORDER BY ti_Module, ti_TableNm
            """)
        cols = [d[0] for d in cur.description]
        return [dict(zip(cols, row)) for row in cur.fetchall()]
    finally:
        conn.close()


# ─────────────────────────────────────────────
# 2. 컬럼 정보 (TXP_ColumnInfo + SYSCOLUMNS 기반)
# ─────────────────────────────────────────────
#
# XP_TableUsedInfo SP의 두 번째 SELECT를 파라미터화.
# SYSINDEXKEYS의 테이블 필터를 COL.id 기준으로 수정 (SP 원본의 하드코딩 수정).
#
_SQL_COLUMN_INFO = """
SELECT
    cc_Num      = MAX(cc_Num),
    ci_TableNm,
    ci_ColumnNm,
    ci_xType    = MAX(ci_xType),
    ci_Null     = MAX(ci_Null),
    cc_PK       = MAX(cc_PK),
    cc_Idx      = MAX(cc_Idx),
    ci_Rmk1     = MAX(ci_Rmk1),
    ci_Rmk2     = MAX(ci_Rmk2),
    ci_Rmk3     = MAX(ci_Rmk3),
    ci_Rmk4     = MAX(ci_Rmk4),
    ci_Rmk5     = MAX(ci_Rmk5),
    ci_Comment  = MAX(ci_Comment),
    ci_Default  = MAX(ci_Default),
    ci_Combo    = MAX(ci_Combo)
FROM (
    SELECT
        cc_Num      = ROW_NUMBER() OVER(ORDER BY COL.offset DESC),
        ci_TableNm  = OBJECT_NAME(COL.id),
        ci_ColumnNm = COL.Name,
        ci_xType    = CASE
                          WHEN STYPE.xType IN (239,231) THEN STYPE.name + '(' + Convert(varchar,COL.Prec) + ') '
                          WHEN STYPE.xType IN (173,175,167,165) THEN STYPE.name + '(' + Convert(varchar,COL.length) + ') '
                          WHEN STYPE.xType = 108 THEN STYPE.name + '(' + Convert(varchar,COL.xPrec) + ',' + Convert(varchar,COL.xScale) + ') '
                          ELSE STYPE.name
                      END + CASE WHEN COL.ColStat = 1 THEN ' Identity' ELSE '' END,
        ci_Null     = CASE WHEN COL.isnullable = 0 THEN 'N' ELSE 'Y' END,
        cc_PK       = CASE WHEN IDX.Status = 2066 THEN 'Y' ELSE 'N' END,
        cc_Idx      = CASE WHEN IDX.Status IN (0, 2066) THEN 'Y' ELSE 'N' END,
        ci_Rmk1     = ci_Rmk1,
        ci_Rmk2     = ci_Rmk2,
        ci_Rmk3     = ci_Rmk3,
        ci_Rmk4     = ci_Rmk4,
        ci_Rmk5     = ci_Rmk5,
        ci_Comment,
        ci_Default,
        ci_Combo
    FROM SYSCOLUMNS COL
    LEFT JOIN SYSTYPES STYPE ON COL.xtype = STYPE.xtype AND STYPE.name <> 'sysname'
    LEFT JOIN TXP_ColumnInfo ON ci_TableNm = OBJECT_NAME(COL.id) AND ci_ColumnNm = COL.name
    LEFT JOIN SYSINDEXKEYS IDK ON COL.id = IDK.id AND COL.colid = IDK.colid
    LEFT JOIN SYSINDEXES  IDX ON IDX.id = COL.ID AND IDX.indid = IDK.indid AND IDX.groupid = 1
    WHERE COL.id = OBJECT_ID(?)
) TMP00
GROUP BY ci_TableNm, ci_ColumnNm
ORDER BY cc_Num
"""


def column_info(table_name: str) -> list[dict]:
    """
    TXP_ColumnInfo + SYSCOLUMNS 기반 컬럼 정의 반환.
    반환 필드: ci_TableNm, ci_ColumnNm, ci_xType, ci_Null, cc_PK, cc_Idx,
               ci_Rmk1~5, ci_Comment, ci_Default, ci_Combo
    """
    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute(_SQL_COLUMN_INFO, table_name)
        cols = [d[0] for d in cur.description]
        return [dict(zip(cols, row)) for row in cur.fetchall()]
    finally:
        conn.close()


# ─────────────────────────────────────────────
# 3. 객체 탐색 (sys.objects 기반)
# ─────────────────────────────────────────────

def find_object(keyword: str) -> list[dict]:
    """
    테이블·프로시저·함수·뷰 이름으로 DB 내 객체 탐색.
    반환: [{"name": "...", "type": "..."}, ...]
    """
    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute("""
            SELECT name, type_desc
            FROM sys.objects
            WHERE name LIKE ? AND type IN ('U','P','FN','TR','V')
            ORDER BY type_desc, name
        """, f"%{keyword}%")
        cols = [d[0] for d in cur.description]
        return [dict(zip(cols, row)) for row in cur.fetchall()]
    finally:
        conn.close()


# ─────────────────────────────────────────────
# CLI 진입점
# ─────────────────────────────────────────────

def _print_rows(rows: list):
    if not rows:
        print("(결과 없음)")
        return
    cols = list(rows[0].keys())
    data = [[str(r.get(c, "")) for c in cols] for r in rows]
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
    parser = argparse.ArgumentParser(description="LossZero GW 메타데이터 조회")
    sub = parser.add_subparsers(dest="cmd")

    p1 = sub.add_parser("table_list", help="테이블 목록 (TXP_TableInfo)")
    p1.add_argument("--pattern", default="", help="LIKE 검색 패턴")

    p2 = sub.add_parser("column_info", help="컬럼 정의 조회")
    p2.add_argument("table", help="테이블명")

    p3 = sub.add_parser("find_object", help="객체 탐색 (테이블/프로시저/함수)")
    p3.add_argument("keyword", help="검색 키워드 (부분 일치)")

    args = parser.parse_args()

    if args.cmd == "table_list":
        rows = table_list(args.pattern)
        print(f"{len(rows)}개 테이블")
        _print_rows(rows)

    elif args.cmd == "column_info":
        rows = column_info(args.table)
        if rows:
            _print_rows(rows)
        else:
            print(f"[WARN] '{args.table}' 컬럼 정보 없음")

    elif args.cmd == "find_object":
        rows = find_object(args.keyword)
        if not rows:
            print(f"'{args.keyword}' 을(를) 찾지 못했습니다.")
        else:
            _print_rows(rows)

    else:
        parser.print_help()
