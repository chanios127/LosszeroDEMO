"""MSSQL connection pool via pyodbc + asyncio.run_in_executor."""
from __future__ import annotations

import asyncio
import logging
import os
import queue
import threading
from contextlib import asynccontextmanager
from typing import AsyncGenerator

import pyodbc

logger = logging.getLogger(__name__)


def _build_connection_string() -> str:
    """Build ODBC connection string from .env variables."""
    direct = os.environ.get("MSSQL_CONNECTION_STRING", "").strip()
    if direct:
        return direct

    # Auto-detect installed ODBC driver
    default_driver = "{SQL Server}"
    try:
        import pyodbc as _pyodbc
        drivers = _pyodbc.drivers()
        for preferred in [
            "ODBC Driver 18 for SQL Server",
            "ODBC Driver 17 for SQL Server",
            "SQL Server Native Client 11.0",
            "SQL Server Native Client 10.0",
            "SQL Server",
        ]:
            if preferred in drivers:
                default_driver = f"{{{preferred}}}" if not preferred.startswith("{") else preferred
                break
    except Exception:
        pass

    driver = os.environ.get("MSSQL_DRIVER", default_driver)
    server = os.environ.get("MSSQL_SERVER", "")
    port = os.environ.get("MSSQL_PORT", "")
    database = os.environ.get("MSSQL_DATABASE", "")
    user = os.environ.get("MSSQL_USER", "")
    password = os.environ.get("MSSQL_PASSWORD", "")

    if not server:
        raise RuntimeError(
            "MSSQL connection not configured. "
            "Set MSSQL_CONNECTION_STRING or MSSQL_SERVER/PORT/DATABASE/USER/PASSWORD in .env"
        )

    # Avoid double port if server already contains comma (e.g. "host,21433")
    if "," in server:
        server_with_port = server
    elif port:
        server_with_port = f"{server},{port}"
    else:
        server_with_port = server
    return (
        f"DRIVER={driver};"
        f"SERVER={server_with_port};"
        f"DATABASE={database};"
        f"UID={user};"
        f"PWD={password};"
        f"TrustServerCertificate=yes;"
    )


class PyodbcPool:
    """Simple thread-safe connection pool for pyodbc."""

    def __init__(self, connection_string: str, max_size: int = 5) -> None:
        self._conn_str = connection_string
        self._max_size = max_size
        self._pool: queue.Queue[pyodbc.Connection] = queue.Queue()
        self._size = 0
        self._lock = threading.Lock()

    def _create_connection(self) -> pyodbc.Connection:
        conn = pyodbc.connect(self._conn_str, autocommit=True)
        logger.debug("Created new pyodbc connection (total: %d)", self._size)
        return conn

    def _validate(self, conn: pyodbc.Connection) -> bool:
        try:
            cursor = conn.cursor()
            cursor.execute("SELECT 1")
            cursor.close()
            return True
        except Exception:
            return False

    def acquire(self) -> pyodbc.Connection:
        # Try pool first
        while not self._pool.empty():
            try:
                conn = self._pool.get_nowait()
            except queue.Empty:
                break
            if self._validate(conn):
                return conn
            try:
                conn.close()
            except Exception:
                pass
            with self._lock:
                self._size -= 1

        # Create new if under limit
        with self._lock:
            if self._size < self._max_size:
                self._size += 1
            else:
                raise RuntimeError(
                    f"Connection pool exhausted (max {self._max_size}). Try again later."
                )
        return self._create_connection()

    def release(self, conn: pyodbc.Connection) -> None:
        try:
            self._pool.put_nowait(conn)
        except queue.Full:
            try:
                conn.close()
            except Exception:
                pass
            with self._lock:
                self._size -= 1

    def close(self) -> None:
        while not self._pool.empty():
            try:
                conn = self._pool.get_nowait()
                conn.close()
            except Exception:
                pass
        with self._lock:
            self._size = 0
        logger.info("MSSQL connection pool closed.")


_pool: PyodbcPool | None = None


async def init_pool() -> None:
    """Initialize the connection pool at server startup."""
    global _pool
    conn_str = _build_connection_string()
    max_size = int(os.environ.get("DB_POOL_SIZE", "5"))

    loop = asyncio.get_event_loop()

    def _init():
        pool = PyodbcPool(conn_str, max_size=max_size)
        # Test connectivity
        conn = pool.acquire()
        pool.release(conn)
        return pool

    _pool = await loop.run_in_executor(None, _init)
    logger.info("MSSQL connection pool initialized (max_size=%d).", max_size)


async def close_pool() -> None:
    global _pool
    if _pool:
        _pool.close()
        _pool = None


@asynccontextmanager
async def get_connection() -> AsyncGenerator[pyodbc.Connection, None]:
    """Async context manager — acquires from pool, releases on exit."""
    if _pool is None:
        raise RuntimeError(
            "DB pool not initialized. Check MSSQL connection settings in .env."
        )

    loop = asyncio.get_event_loop()
    conn = await loop.run_in_executor(None, _pool.acquire)
    try:
        yield conn
    finally:
        await loop.run_in_executor(None, _pool.release, conn)
