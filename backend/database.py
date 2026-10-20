import sqlite3
import os
from typing import List, Dict, Any
from datetime import datetime

DB_PATH = os.path.join(os.path.dirname(__file__), "tetris.db")

def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
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
    cursor.execute("""
        SELECT id, player_name, score, lines, level, mode, created_at
        FROM leaderboard
        WHERE mode = ?
        ORDER BY score DESC, lines DESC
        LIMIT ?
    """, (mode, limit))
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]

def add_score(player_name: str, score: int, lines: int, level: int, mode: str = "solo") -> Dict[str, Any]:
    cleaned_name = (player_name or "Anonymous").strip()[:16]
    if not cleaned_name:
        cleaned_name = "Anonymous"
    
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    conn = get_connection()
    cursor = conn.cursor()
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
    cursor.execute("""
        SELECT id, player_name, score, lines, level, duration_seconds, outcome, mode, ip_address, created_at
        FROM game_logs
        ORDER BY id DESC
        LIMIT ?
    """, (limit,))
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]
