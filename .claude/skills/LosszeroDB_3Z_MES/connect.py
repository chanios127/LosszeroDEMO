"""
LossZero MSSQL 멀티 DB 커넥터

채널 구조:
  DB0 (base)  — 표준 DB, 메타데이터, 표준 기능 명세
  DB1 (logic) — 실제 비즈니스 DB
  DB2 (logic2)— (optional) 상호참조용 추가 비즈니스 DB

사용법:
  from connect import get_connection
  conn = get_connection(0)       # Base DB
  conn = get_connection(1)       # Logic DB
  conn = get_connection(2)       # Logic DB2
  conn = get_connection("base")  # 별칭도 가능
"""
import os
import sys
import pyodbc
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(dotenv_path=Path(__file__).parent / ".env")

CHANNEL_ALIASES = {
    "base": 0, "standard": 0, "meta": 0,
    "logic": 1, "biz": 1, "business": 1,
    "logic2": 2, "cross": 2, "ref": 2,
}

CHANNEL_LABELS = {
    0: "Base DB (표준/메타)",
    1: "Logic DB (비즈니스)",
    2: "Logic DB2 (상호참조)",
}


def _resolve_channel(db) -> int:
    """채널 번호 또는 별칭을 정수 채널로 변환"""
    if isinstance(db, int):
        if db not in (0, 1, 2):
            print(f"[ERROR] 유효한 채널: 0, 1, 2 (입력: {db})", file=sys.stderr)
            sys.exit(1)
        return db
    if isinstance(db, str):
        if db.isdigit():
            return _resolve_channel(int(db))
        alias = db.lower().strip()
        if alias in CHANNEL_ALIASES:
            return CHANNEL_ALIASES[alias]
        print(f"[ERROR] 알 수 없는 DB 별칭: '{db}'", file=sys.stderr)
        print(f"  사용 가능: {', '.join(sorted(CHANNEL_ALIASES.keys()))}", file=sys.stderr)
        sys.exit(1)
    print(f"[ERROR] db 파라미터 타입 오류: {type(db)}", file=sys.stderr)
    sys.exit(1)


def get_connection(db=0) -> pyodbc.Connection:
    """지정된 채널의 MSSQL 연결을 반환 (읽기 전용)"""
    ch = _resolve_channel(db)
    prefix = f"DB{ch}_"
    label = CHANNEL_LABELS[ch]

    required_keys = ["SERVER", "DATABASE", "USER", "PASSWORD"]
    env_keys = {k: f"{prefix}{k}" for k in required_keys}

    missing = [env_keys[k] for k in required_keys if not os.getenv(env_keys[k])]
    if missing:
        print(f"[ERROR] [{label}] .env에 누락된 항목: {', '.join(missing)}", file=sys.stderr)
        sys.exit(1)

    driver = os.getenv(f"{prefix}DRIVER", "ODBC Driver 17 for SQL Server")
    server = os.getenv(env_keys["SERVER"])

    conn_str = (
        f"DRIVER={{{driver}}};"
        f"SERVER={server};"
        f"DATABASE={os.getenv(env_keys['DATABASE'])};"
        f"UID={os.getenv(env_keys['USER'])};"
        f"PWD={os.getenv(env_keys['PASSWORD'])};"
        f"TrustServerCertificate=yes;"
        f"Connection Timeout=10;"
    )

    try:
        return pyodbc.connect(conn_str, readonly=True)
    except pyodbc.Error as e:
        print(f"[ERROR] [{label}] MSSQL 연결 실패: {e}", file=sys.stderr)
        sys.exit(1)


def list_channels() -> list[dict]:
    """설정된 채널 목록 반환 (연결 테스트 없이 .env 기준)"""
    channels = []
    for ch in range(3):
        prefix = f"DB{ch}_"
        server = os.getenv(f"{prefix}SERVER")
        database = os.getenv(f"{prefix}DATABASE")
        if server and database:
            channels.append({
                "channel": ch,
                "label": CHANNEL_LABELS[ch],
                "server": server,
                "database": database,
            })
    return channels


if __name__ == "__main__":
    channels = list_channels()
    if not channels:
        print("[WARN] 설정된 DB 채널이 없습니다. .env를 확인하세요.")
        sys.exit(1)

    for info in channels:
        ch = info["channel"]
        try:
            conn = get_connection(ch)
            print(f"[OK] CH{ch} {info['label']}: {info['server']} / {info['database']}")
            conn.close()
        except SystemExit:
            print(f"[FAIL] CH{ch} {info['label']}: 연결 실패")
