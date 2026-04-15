"""
LossZero MSSQL 자유 쿼리 실행기 (읽기 전용, 멀티 DB)

사용법:
  python Query.py "SELECT TOP 10 * FROM SomeTable"
  python Query.py "SELECT TOP 10 * FROM SomeTable" --db 0
  python Query.py "SELECT TOP 10 * FROM BizTable" --db 1
  python Query.py "SELECT TOP 10 * FROM RefTable" --db logic2
  python Query.py --channels                        # 설정된 채널 목록

옵션:
  --db N|alias  대상 DB 채널 (기본: 0=base)
                숫자: 0, 1, 2
                별칭: base, logic, logic2, biz, meta, cross 등
  --format      table(기본), plain, csv
  --limit N     최대 행 수 (기본: 100)
  --no-header   컬럼명 헤더 제거
  --channels    설정된 DB 채널 목록 출력 후 종료
"""
import sys
import argparse
import csv
import io
from connect import get_connection, list_channels


WRITE_KEYWORDS = ("INSERT", "UPDATE", "DELETE", "DROP", "TRUNCATE", "ALTER", "CREATE", "EXEC", "EXECUTE")


def is_read_only(sql: str) -> bool:
    first_word = sql.strip().upper().split()[0] if sql.strip() else ""
    return first_word not in WRITE_KEYWORDS


def format_table(columns: list, rows: list) -> str:
    if not rows:
        return "(결과 없음)"

    col_widths = [len(str(c)) for c in columns]
    for row in rows:
        for i, val in enumerate(row):
            col_widths[i] = max(col_widths[i], len(str(val) if val is not None else "NULL"))

    sep = "+" + "+".join("-" * (w + 2) for w in col_widths) + "+"
    header = "|" + "|".join(f" {str(c):<{w}} " for c, w in zip(columns, col_widths)) + "|"

    lines = [sep, header, sep]
    for row in rows:
        line = "|" + "|".join(
            f" {str(v) if v is not None else 'NULL':<{w}} "
            for v, w in zip(row, col_widths)
        ) + "|"
        lines.append(line)
    lines.append(sep)
    return "\n".join(lines)


def format_plain(columns: list, rows: list) -> str:
    if not rows:
        return "(결과 없음)"
    lines = ["\t".join(str(c) for c in columns)]
    for row in rows:
        lines.append("\t".join(str(v) if v is not None else "NULL" for v in row))
    return "\n".join(lines)


def format_csv(columns: list, rows: list) -> str:
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(columns)
    for row in rows:
        writer.writerow(v if v is not None else "" for v in row)
    return output.getvalue()


def run(sql: str, db=0, fmt: str = "table", limit: int = 100, no_header: bool = False) -> None:
    sql = sql.strip().rstrip(";")

    if not is_read_only(sql):
        print("[BLOCKED] 쓰기 작업은 허용되지 않습니다.", file=sys.stderr)
        print(f"[BLOCKED] 감지된 키워드: {sql.split()[0].upper()}", file=sys.stderr)
        sys.exit(1)

    # MSSQL에서 TOP으로 행 수 제한 (이미 TOP이 있으면 적용 안 함)
    upper = sql.upper()
    if "SELECT" in upper and "TOP " not in upper and "ROWNUM" not in upper:
        sql = sql.replace("SELECT ", f"SELECT TOP {limit} ", 1)
        sql = sql.replace("select ", f"SELECT TOP {limit} ", 1)

    conn = get_connection(db)
    try:
        cursor = conn.cursor()
        cursor.execute(sql)
        columns = [desc[0] for desc in cursor.description]
        rows = cursor.fetchall()

        print(f"[INFO] CH{db} → {len(rows)}행 반환\n")

        if fmt == "table":
            output = format_table(columns, rows)
            if no_header:
                output = "\n".join(output.split("\n")[3:])
        elif fmt == "plain":
            lines = format_plain(columns, rows).split("\n")
            output = "\n".join(lines[1:] if no_header else lines)
        elif fmt == "csv":
            lines = format_csv(columns, rows).strip().split("\n")
            output = "\n".join(lines[1:] if no_header else lines)
        else:
            output = format_table(columns, rows)

        print(output)

    except Exception as e:
        print(f"[ERROR] 쿼리 실행 실패: {e}", file=sys.stderr)
        sys.exit(1)
    finally:
        conn.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="MSSQL 읽기 전용 자유 쿼리 (멀티 DB)")
    parser.add_argument("sql", nargs="?", help="실행할 SQL (없으면 stdin에서 읽음)")
    parser.add_argument("--db", default="1", help="대상 DB 채널: 0(base), 1(logic), 2(logic2) 또는 별칭")
    parser.add_argument("--format", choices=["table", "plain", "csv"], default="table")
    parser.add_argument("--limit", type=int, default=100, help="최대 행 수 (기본: 100)")
    parser.add_argument("--no-header", action="store_true")
    parser.add_argument("--channels", action="store_true", help="설정된 DB 채널 목록 출력")
    args = parser.parse_args()

    if args.channels:
        channels = list_channels()
        if not channels:
            print("설정된 DB 채널이 없습니다. .env를 확인하세요.")
        else:
            for info in channels:
                print(f"  CH{info['channel']}: {info['label']} - {info['server']} / {info['database']}")
        sys.exit(0)

    sql = args.sql
    if not sql:
        if not sys.stdin.isatty():
            sql = sys.stdin.read().strip()
        else:
            print("[ERROR] SQL을 인자로 전달하거나 stdin으로 파이프하세요.", file=sys.stderr)
            print('  사용법: python Query.py "SELECT TOP 10 * FROM SomeTable" --db 0', file=sys.stderr)
            sys.exit(1)

    run(sql, db=args.db, fmt=args.format, limit=args.limit, no_header=args.no_header)
