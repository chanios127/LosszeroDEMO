"""LossZero GW MSSQL 커넥터 (단일 DB, 읽기 전용)"""
import os
import sys
import pyodbc
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(dotenv_path=Path(__file__).parent / ".env")


def get_connection() -> pyodbc.Connection:
    """단일 MSSQL 연결 반환 (읽기 전용). .env의 MSSQL_* 변수 사용."""
    required = ["MSSQL_SERVER", "MSSQL_DATABASE", "MSSQL_USER", "MSSQL_PASSWORD"]
    missing = [k for k in required if not os.getenv(k)]
    if missing:
        print(f"[ERROR] .env 누락: {', '.join(missing)}", file=sys.stderr)
        sys.exit(1)

    driver = os.getenv("MSSQL_DRIVER", "SQL Server")
    conn_str = (
        f"DRIVER={{{driver}}};"
        f"SERVER={os.getenv('MSSQL_SERVER')};"
        f"DATABASE={os.getenv('MSSQL_DATABASE')};"
        f"UID={os.getenv('MSSQL_USER')};"
        f"PWD={os.getenv('MSSQL_PASSWORD')};"
        f"TrustServerCertificate=yes;"
        f"Connection Timeout=10;"
    )
    try:
        return pyodbc.connect(conn_str, readonly=True)
    except pyodbc.Error as e:
        print(f"[ERROR] MSSQL 연결 실패: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    try:
        conn = get_connection()
        db = os.getenv("MSSQL_DATABASE")
        server = os.getenv("MSSQL_SERVER")
        print(f"[OK] {server} / {db} 연결 성공")
        conn.close()
    except SystemExit:
        pass
