import os
import time
import logging
from typing import List, Dict, Any, Optional
from datetime import datetime
import sqlite3

try:
    import psycopg2
    from psycopg2 import pool, extras
    PSYCOPG2_AVAILABLE = True
except ImportError:
    PSYCOPG2_AVAILABLE = False

logger = logging.getLogger("tetris.database")

# Environment / Database Configuration
DATABASE_URL = os.environ.get("DATABASE_URL")
POSTGRES_HOST = os.environ.get("POSTGRES_HOST")
POSTGRES_PORT = int(os.environ.get("POSTGRES_PORT", "5432"))
POSTGRES_USER = os.environ.get("POSTGRES_USER", "postgres")
POSTGRES_PASSWORD = os.environ.get("POSTGRES_PASSWORD", "postgres")
POSTGRES_DB = os.environ.get("POSTGRES_DB", "tetris_db")

DB_PATH = os.environ.get("TETRIS_DB_PATH", os.path.join(os.path.dirname(__file__), "tetris.db"))
FORCE_SQLITE = os.environ.get("FORCE_SQLITE", "false").lower() in ("1", "true", "yes")

# Database state
IS_POSTGRES = False
pg_pool: Optional[Any] = None


class PostgresConnectionWrapper:
    """Wrapper that provides dictionary cursor and returns connection to pool on close()."""
    def __init__(self, conn, pool_ref):
        self._conn = conn
        self._pool = pool_ref

    def cursor(self):
        return self._conn.cursor(cursor_factory=extras.RealDictCursor)

    def commit(self):
        self._conn.commit()

    def rollback(self):
        self._conn.rollback()

    def close(self):
        if self._pool and self._conn:
            try:
                self._pool.putconn(self._conn)
            except Exception as e:
                logger.warning(f"Error returning connection to pool: {e}")
        elif self._conn:
            self._conn.close()


def _get_pg_kwargs():
    if DATABASE_URL:
        return {"dsn": DATABASE_URL}
    return {
        "host": POSTGRES_HOST or "localhost",
        "port": POSTGRES_PORT,
        "user": POSTGRES_USER,
        "password": POSTGRES_PASSWORD,
        "dbname": POSTGRES_DB,
    }


def get_connection():
    global IS_POSTGRES, pg_pool
    if IS_POSTGRES and pg_pool:
        try:
            raw_conn = pg_pool.getconn()
            return PostgresConnectionWrapper(raw_conn, pg_pool)
        except Exception as e:
            logger.error(f"Failed to obtain connection from PostgreSQL pool: {e}")
    
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    global IS_POSTGRES, pg_pool

    should_try_postgres = not FORCE_SQLITE and PSYCOPG2_AVAILABLE and (
        DATABASE_URL is not None or POSTGRES_HOST is not None or os.environ.get("USE_POSTGRES", "true").lower() in ("1", "true", "yes")
    )

    if should_try_postgres:
        pg_kwargs = _get_pg_kwargs()
        retries = 3 if not (DATABASE_URL or POSTGRES_HOST) else 5
        target_display = DATABASE_URL or f"{pg_kwargs.get('host', 'localhost')}:{POSTGRES_PORT}/{POSTGRES_DB}"

        for attempt in range(1, retries + 1):
            try:
                temp_pool = pool.ThreadedConnectionPool(minconn=1, maxconn=10, **pg_kwargs)
                test_conn = temp_pool.getconn()
                with test_conn.cursor() as cur:
                    cur.execute("SELECT 1;")
                temp_pool.putconn(test_conn)

                pg_pool = temp_pool
                IS_POSTGRES = True
                print(f"[Database] Connected successfully to PostgreSQL ({target_display}).")
                break
            except Exception as e:
                if attempt == retries:
                    err_msg = getattr(e, 'pgerror', None) or f"{type(e).__name__}: Server not reachable or connection refused"
                    print(f"[Database] Could not connect to PostgreSQL ({target_display}): {err_msg}. Falling back to SQLite ({DB_PATH}).")
                else:
                    time.sleep(1)

    if IS_POSTGRES:
        _init_postgres()
    else:
        _init_sqlite()


def _init_postgres():
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS leaderboard (
            id SERIAL PRIMARY KEY,
            player_name VARCHAR(100) NOT NULL,
            score INTEGER NOT NULL,
            lines INTEGER NOT NULL,
            level INTEGER NOT NULL,
            mode VARCHAR(50) NOT NULL DEFAULT 'solo',
            created_at VARCHAR(50) NOT NULL
        );
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS game_logs (
            id SERIAL PRIMARY KEY,
            player_name VARCHAR(100) NOT NULL,
            score INTEGER NOT NULL,
            lines INTEGER NOT NULL,
            level INTEGER NOT NULL,
            duration_seconds INTEGER NOT NULL,
            outcome VARCHAR(50) NOT NULL,
            mode VARCHAR(50) NOT NULL,
            ip_address VARCHAR(50),
            created_at VARCHAR(50) NOT NULL
        );
    """)
    conn.commit()

    # Seed leaderboard if empty
    cursor.execute("SELECT COUNT(*) AS total FROM leaderboard;")
    row = cursor.fetchone()
    count = row["total"] if isinstance(row, dict) and "total" in row else (row[0] if row else 0)
    if count == 0:
        seed_data = [
            ("CyberAce", 142800, 112, 12, "solo", "2026-10-15 14:22:00"),
            ("NeonValkyrie", 98500, 84, 9, "solo", "2026-10-16 09:15:00"),
            ("TetrisGod", 76400, 68, 7, "solo", "2026-10-16 18:40:00"),
            ("GhostDrop", 52100, 48, 5, "solo", "2026-10-17 11:05:00"),
            ("PixelWarrior", 34200, 32, 4, "solo", "2026-10-17 14:50:00"),
            ("GlitchHacker", 21800, 22, 3, "solo", "2026-10-17 15:30:00"),
            ("Vortex99", 15400, 16, 2, "solo", "2026-10-17 16:00:00"),
        ]
        cursor.executemany("""
            INSERT INTO leaderboard (player_name, score, lines, level, mode, created_at)
            VALUES (%s, %s, %s, %s, %s, %s);
        """, seed_data)
        conn.commit()

    conn.close()


def _init_sqlite():
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS leaderboard (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            player_name TEXT NOT NULL,
            score INTEGER NOT NULL,
            lines INTEGER NOT NULL,
            level INTEGER NOT NULL,
            mode TEXT NOT NULL DEFAULT 'solo',
            created_at TEXT NOT NULL
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS game_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            player_name TEXT NOT NULL,
            score INTEGER NOT NULL,
            lines INTEGER NOT NULL,
            level INTEGER NOT NULL,
            duration_seconds INTEGER NOT NULL,
            outcome TEXT NOT NULL,
            mode TEXT NOT NULL,
            ip_address TEXT,
            created_at TEXT NOT NULL
        )
    """)
    conn.commit()

    # Seed leaderboard if empty
    cursor.execute("SELECT COUNT(*) FROM leaderboard")
    count = cursor.fetchone()[0]
    if count == 0:
        seed_data = [
            ("CyberAce", 142800, 112, 12, "solo", "2026-10-15 14:22:00"),
            ("NeonValkyrie", 98500, 84, 9, "solo", "2026-10-16 09:15:00"),
            ("TetrisGod", 76400, 68, 7, "solo", "2026-10-16 18:40:00"),
            ("GhostDrop", 52100, 48, 5, "solo", "2026-10-17 11:05:00"),
            ("PixelWarrior", 34200, 32, 4, "solo", "2026-10-17 14:50:00"),
            ("GlitchHacker", 21800, 22, 3, "solo", "2026-10-17 15:30:00"),
            ("Vortex99", 15400, 16, 2, "solo", "2026-10-17 16:00:00"),
        ]
        cursor.executemany("""
            INSERT INTO leaderboard (player_name, score, lines, level, mode, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
        """, seed_data)
        conn.commit()

    conn.close()


def get_leaderboard(limit: int = 20, mode: str = "solo") -> List[Dict[str, Any]]:
    conn = get_connection()
    cursor = conn.cursor()
    query = """
        SELECT id, player_name, score, lines, level, mode, created_at
        FROM leaderboard
        WHERE mode = %s
        ORDER BY score DESC, lines DESC
        LIMIT %s
    """ if IS_POSTGRES else """
        SELECT id, player_name, score, lines, level, mode, created_at
        FROM leaderboard
        WHERE mode = ?
        ORDER BY score DESC, lines DESC
        LIMIT ?
    """
    cursor.execute(query, (mode, limit))
    rows = cursor.fetchall()
    conn.close()
    return [
        {
            "id": row["id"],
            "player_name": row["player_name"],
            "score": row["score"],
            "lines": row["lines"],
            "level": row["level"],
            "mode": row["mode"],
            "created_at": str(row["created_at"]),
        }
        for row in rows
    ]


def add_score(player_name: str, score: int, lines: int, level: int, mode: str = "solo") -> Dict[str, Any]:
    cleaned_name = (player_name or "Anonymous").strip()[:16]
    if not cleaned_name:
        cleaned_name = "Anonymous"
    
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    conn = get_connection()
    cursor = conn.cursor()

    if IS_POSTGRES:
        cursor.execute("""
            INSERT INTO leaderboard (player_name, score, lines, level, mode, created_at)
            VALUES (%s, %s, %s, %s, %s, %s)
            RETURNING id;
        """, (cleaned_name, max(0, score), max(0, lines), max(1, level), mode, now_str))
        res = cursor.fetchone()
        new_id = res["id"] if isinstance(res, dict) else res[0]
    else:
        cursor.execute("""
            INSERT INTO leaderboard (player_name, score, lines, level, mode, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (cleaned_name, max(0, score), max(0, lines), max(1, level), mode, now_str))
        new_id = cursor.lastrowid

    conn.commit()
    conn.close()

    return {
        "id": new_id,
        "player_name": cleaned_name,
        "score": score,
        "lines": lines,
        "level": level,
        "mode": mode,
        "created_at": now_str
    }


def record_game_loss(
    player_name: str,
    score: int,
    lines: int,
    level: int,
    duration_seconds: int = 0,
    outcome: str = "defeat",
    mode: str = "solo",
    ip_address: str = "127.0.0.1"
) -> Dict[str, Any]:
    """Automatically records match loss/game-over and updates leaderboard if valid"""
    cleaned_name = (player_name or "Player").strip()[:16]
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    conn = get_connection()
    cursor = conn.cursor()

    if IS_POSTGRES:
        cursor.execute("""
            INSERT INTO game_logs (player_name, score, lines, level, duration_seconds, outcome, mode, ip_address, created_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id;
        """, (cleaned_name, max(0, score), max(0, lines), max(1, level), max(0, duration_seconds), outcome, mode, ip_address, now_str))
        res = cursor.fetchone()
        log_id = res["id"] if isinstance(res, dict) else res[0]

        # Auto-add to leaderboard if positive score
        if score > 0:
            cursor.execute("""
                INSERT INTO leaderboard (player_name, score, lines, level, mode, created_at)
                VALUES (%s, %s, %s, %s, %s, %s);
            """, (cleaned_name, score, lines, level, mode, now_str))
    else:
        cursor.execute("""
            INSERT INTO game_logs (player_name, score, lines, level, duration_seconds, outcome, mode, ip_address, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (cleaned_name, max(0, score), max(0, lines), max(1, level), max(0, duration_seconds), outcome, mode, ip_address, now_str))
        log_id = cursor.lastrowid

        # Auto-add to leaderboard if positive score
        if score > 0:
            cursor.execute("""
                INSERT INTO leaderboard (player_name, score, lines, level, mode, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (cleaned_name, score, lines, level, mode, now_str))

    conn.commit()
    conn.close()

    return {
        "id": log_id,
        "player_name": cleaned_name,
        "score": score,
        "lines": lines,
        "level": level,
        "duration_seconds": duration_seconds,
        "outcome": outcome,
        "mode": mode,
        "created_at": now_str,
        "auto_saved": True
    }


def get_game_logs(limit: int = 25) -> List[Dict[str, Any]]:
    conn = get_connection()
    cursor = conn.cursor()
    query = """
        SELECT id, player_name, score, lines, level, duration_seconds, outcome, mode, ip_address, created_at
        FROM game_logs
        ORDER BY id DESC
        LIMIT %s
    """ if IS_POSTGRES else """
        SELECT id, player_name, score, lines, level, duration_seconds, outcome, mode, ip_address, created_at
        FROM game_logs
        ORDER BY id DESC
        LIMIT ?
    """
    cursor.execute(query, (limit,))
    rows = cursor.fetchall()
    conn.close()
    return [
        {
            "id": row["id"],
            "player_name": row["player_name"],
            "score": row["score"],
            "lines": row["lines"],
            "level": row["level"],
            "duration_seconds": row["duration_seconds"],
            "outcome": row["outcome"],
            "mode": row["mode"],
            "ip_address": row["ip_address"],
            "created_at": str(row["created_at"]),
        }
        for row in rows
    ]
