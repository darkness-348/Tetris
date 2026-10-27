import asyncio
import collections
import json
import random
import time
import uuid
from contextlib import asynccontextmanager
from typing import Dict, Any, List

from fastapi import FastAPI, Request, Response, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware

from database import init_db, get_leaderboard, add_score, record_game_loss, get_game_logs
from models import (
    ScoreCreate,
    ScoreResponse,
    LeaderboardResponse,
    NextPieceRequest,
    NextPieceResponse,
    NextPieceData,
    LossRecordRequest,
    LossRecordResponse,
    TrafficStatsResponse,
    TrafficLogItem,
)
from rooms import manager, Room

# Standard Tetromino Shapes for Server-side Generation
TETROMINO_DATA = {
    "I": [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]],
    "J": [[2, 0, 0], [2, 2, 2], [0, 0, 0]],
    "L": [[0, 0, 3], [3, 3, 3], [0, 0, 0]],
    "O": [[4, 4], [4, 4]],
    "S": [[0, 5, 5], [5, 5, 0], [0, 0, 0]],
    "T": [[0, 6, 0], [6, 6, 6], [0, 0, 0]],
    "Z": [[7, 7, 0], [0, 7, 7], [0, 0, 0]],
}

# Live Server Traffic Metrics Tracker
class TrafficTracker:
    def __init__(self):
        self.total_http_requests = 0
        self.total_pieces_generated = 0
        self.total_auto_losses_saved = 0
        self.total_ws_messages_in = 0
        self.total_ws_messages_out = 0
        self.bytes_transferred = 0
        self.active_ws_clients = 0
        self.start_time = time.time()
        self.recent_logs = collections.deque(maxlen=60)

    def log_http(self, method: str, path: str, status: int, duration_ms: float, client_ip: str, byte_count: int):
        self.total_http_requests += 1
        self.bytes_transferred += byte_count
        now_str = time.strftime("%H:%M:%S")
        self.recent_logs.appendleft({
            "timestamp": now_str,
            "method": method,
            "endpoint": path,
            "status_code": status,
            "duration_ms": round(duration_ms, 2),
            "client_ip": client_ip,
            "bytes": byte_count
        })

traffic = TrafficTracker()

# FastAPI Lifecycle
@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    print("Tetris Database & Traffic Tracker initialized.")
    yield
    print("Tetris Backend shutting down.")

app = FastAPI(
    title="CyberTetris Online API // Traffic Monitor",
    description="Backend API with Real-time WebSockets, Server-side RNG Piece Dispenser, and Auto-Loss Logging",
    version="1.1.0",
    lifespan=lifespan
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Traffic Monitoring Middleware
class TrafficMonitorMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        start = time.perf_counter()
        client_ip = request.client.host if request.client else "127.0.0.1"

        response: Response = await call_next(request)
        duration_ms = (time.perf_counter() - start) * 1000

        # Estimate transferred bytes
        content_length = response.headers.get("content-length")
        bytes_count = int(content_length) if content_length and content_length.isdigit() else 256

        # Avoid spamming internal traffic poller if logging
        if request.url.path != "/api/traffic":
            traffic.log_http(
                method=request.method,
                path=request.url.path,
                status=response.status_code,
                duration_ms=duration_ms,
                client_ip=client_ip,
                byte_count=bytes_count
            )
        else:
            traffic.total_http_requests += 1
            traffic.bytes_transferred += bytes_count

        return response

app.add_middleware(TrafficMonitorMiddleware)


# ---------------- REST ENDPOINTS ----------------

@app.get("/api/health")
def health_check():
    return {
        "status": "online",
        "service": "CyberTetris Backend",
        "active_rooms": len(manager.rooms),
        "queue_count": len(manager.matchmaking_queue),
        "total_requests": traffic.total_http_requests
    }

# 1. SERVER-SIDE PIECE GENERATOR (Generates constant HTTP traffic)
@app.post("/api/game/next-piece", response_model=NextPieceResponse)
def generate_next_piece(req: NextPieceRequest):
    """Generates random piece(s) from server-side RNG to feed game and generate server traffic"""
    count = min(7, max(1, req.count))
    pieces_out: List[NextPieceData] = []
    
    # 7-Bag generation on server
    piece_keys = list(TETROMINO_DATA.keys())
    random.shuffle(piece_keys)

    for i in range(count):
        ptype = piece_keys[i % len(piece_keys)]
        shape = TETROMINO_DATA[ptype]
        piece_id = f"pc-{uuid.uuid4().hex[:8]}"

        pieces_out.append(NextPieceData(
            piece_type=ptype,
            matrix=shape,
            piece_id=piece_id,
            generated_at=time.time()
        ))

    traffic.total_pieces_generated += count

    return {
        "status": "ok",
        "pieces": pieces_out,
        "server_time": time.time()
    }

# 2. AUTOMATIC LOSS RECORDING (Automatically saves when player loses)
@app.post("/api/game/record-loss", response_model=LossRecordResponse)
def record_loss(record: LossRecordRequest, request: Request):
    """Automatically logs player defeat / game-over with full stats in SQLite"""
    client_ip = request.client.host if request.client else "127.0.0.1"
    
    res = record_game_loss(
        player_name=record.player_name,
        score=record.score,
        lines=record.lines,
        level=record.level,
        duration_seconds=record.duration_seconds,
        outcome=record.outcome,
        mode=record.mode,
        ip_address=client_ip
    )

    traffic.total_auto_losses_saved += 1

    return {
        "status": "recorded",
        "id": res["id"],
        "player_name": res["player_name"],
        "score": res["score"],
        "lines": res["lines"],
        "level": res["level"],
        "auto_saved": True,
        "created_at": res["created_at"]
    }

# 3. LIVE TRAFFIC METRICS (For traffic control system inspection)
@app.get("/api/traffic", response_model=TrafficStatsResponse)
def get_traffic_metrics():
    """Provides real-time server traffic metrics, RPS, and recent request inspection logs"""
    uptime = time.time() - traffic.start_time
    
    return {
        "total_http_requests": traffic.total_http_requests,
        "total_pieces_generated": traffic.total_pieces_generated,
        "total_auto_losses_saved": traffic.total_auto_losses_saved,
        "total_ws_messages_in": traffic.total_ws_messages_in,
        "total_ws_messages_out": traffic.total_ws_messages_out,
        "active_ws_clients": traffic.active_ws_clients,
        "bytes_transferred": traffic.bytes_transferred,
        "server_uptime_seconds": round(uptime, 1),
        "recent_requests": list(traffic.recent_logs)
    }

@app.get("/api/game/history")
def get_match_history(limit: int = 25):
    return get_game_logs(limit=limit)

@app.get("/api/leaderboard", response_model=LeaderboardResponse)
def fetch_leaderboard(limit: int = 20, mode: str = "solo"):
    scores = get_leaderboard(limit=limit, mode=mode)
    return {
        "status": "success",
        "total": len(scores),
        "scores": scores
    }

@app.post("/api/leaderboard", response_model=ScoreResponse)
def submit_score(score_data: ScoreCreate):
    entry = add_score(
        player_name=score_data.player_name,
        score=score_data.score,
        lines=score_data.lines,
        level=score_data.level,
        mode=score_data.mode
    )
    return entry

@app.get("/api/rooms")
def list_rooms():
    return [room.to_dict() for room in manager.rooms.values()]


# ---------------- WEBSOCKET 1v1 BATTLE & TRAFFIC ----------------

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    traffic.active_ws_clients += 1
    client_id = str(uuid.uuid4())[:8]

    # Helper for sending with traffic tracking
    async def send_tracked(ws: WebSocket, payload_dict: dict):
        traffic.total_ws_messages_out += 1
        raw = json.dumps(payload_dict)
        traffic.bytes_transferred += len(raw)
        await ws.send_text(raw)

    # Handshake greeting
    await send_tracked(websocket, {
        "type": "connected",
        "clientId": client_id,
        "message": "Connected to CyberTetris Battle & Traffic Server"
    })

    try:
        while True:
            raw_data = await websocket.receive_text()
            traffic.total_ws_messages_in += 1
            traffic.bytes_transferred += len(raw_data)

            try:
                data = json.loads(raw_data)
            except json.JSONDecodeError:
                continue

            msg_type = data.get("type")
            player_name = (data.get("playerName") or f"Player-{client_id[:4]}").strip()[:16]

            # 1. Create Private Room
            if msg_type == "create_room":
                room = manager.create_room(client_id, player_name, websocket)
                await send_tracked(websocket, {
                    "type": "room_created",
                    "roomId": room.room_id,
                    "seed": room.seed,
                    "players": [p.name for p in room.players.values()]
                })

            # 2. Join Private Room
            elif msg_type == "join_room":
                target_room_id = data.get("roomId", "").strip().upper()
                room, error_msg = manager.join_room(target_room_id, client_id, player_name, websocket)
                if error_msg:
                    await send_tracked(websocket, {
                        "type": "error",
                        "message": error_msg
                    })
                else:
                    await send_tracked(websocket, {
                        "type": "room_joined",
                        "roomId": room.room_id,
                        "seed": room.seed,
                        "players": [p.name for p in room.players.values()]
                    })
                    await manager.send_to_opponent(room, client_id, {
                        "type": "opponent_joined",
                        "opponentName": player_name,
                        "players": [p.name for p in room.players.values()]
                    })

            # 3. Matchmaking Queue
            elif msg_type == "join_queue":
                room, matched = manager.join_matchmaking(client_id, player_name, websocket)
                if not matched:
                    await send_tracked(websocket, {
                        "type": "queue_waiting",
                        "message": "Buscando oponente en línea..."
                    })
                else:
                    for pid, player in room.players.items():
                        opp = room.get_opponent(pid)
                        await send_tracked(player.websocket, {
                            "type": "match_found",
                            "roomId": room.room_id,
                            "seed": room.seed,
                            "playerName": player.name,
                            "opponentName": opp.name if opp else "Rival",
                            "players": [p.name for p in room.players.values()]
                        })

            # 4. Player Ready & Start Match
            elif msg_type in ("player_ready", "start_game"):
                room = manager.get_room_by_client(client_id)
                if room:
                    player = room.get_player(client_id)
                    if player:
                        player.is_ready = True
                    
                    await manager.send_to_opponent(room, client_id, {
                        "type": "opponent_ready",
                        "ready": True
                    })

                    # If both players are ready or start_game is called with 2 players in waiting state
                    if len(room.players) == 2 and room.state == "waiting":
                        if msg_type == "start_game" or all(p.is_ready for p in room.players.values()):
                            for p in room.players.values():
                                p.is_ready = True
                            room.state = "countdown"
                            asyncio.create_task(run_game_countdown(room))

            # 5. Live Board Sync
            elif msg_type == "board_update":
                room = manager.get_room_by_client(client_id)
                if room and room.state == "in_game":
                    traffic.total_ws_messages_out += 1
                    await manager.send_to_opponent(room, client_id, {
                        "type": "opponent_board",
                        "matrix": data.get("matrix"),
                        "score": data.get("score", 0),
                        "lines": data.get("lines", 0),
                        "level": data.get("level", 1),
                        "currentPiece": data.get("currentPiece"),
                        "holdPiece": data.get("holdPiece")
                    })

            # 6. Lines Cleared / Garbage Attack
            elif msg_type == "lines_cleared":
                room = manager.get_room_by_client(client_id)
                lines_cleared = int(data.get("count", 0))
                garbage_count = manager.calculate_garbage_lines(lines_cleared)

                if room and room.state == "in_game" and garbage_count > 0:
                    hole_column = random.randint(0, 9)
                    await manager.send_to_opponent(room, client_id, {
                        "type": "incoming_garbage",
                        "lines": garbage_count,
                        "hole": hole_column,
                        "attacker": player_name
                    })
                    await send_tracked(websocket, {
                        "type": "garbage_sent",
                        "lines": garbage_count
                    })

            # 7. Player Game Over (Automatically recorded in database!)
            elif msg_type == "game_over":
                room = manager.get_room_by_client(client_id)
                if room and room.state == "in_game":
                    room.state = "game_over"
                    opponent = room.get_opponent(client_id)
                    winner_name = opponent.name if opponent else "N/A"

                    # Automatically save loss to SQLite
                    record_game_loss(
                        player_name=player_name,
                        score=data.get("score", 0),
                        lines=data.get("lines", 0),
                        level=data.get("level", 1),
                        duration_seconds=data.get("duration", 0),
                        outcome="defeat_1v1",
                        mode="multiplayer_1v1"
                    )
                    traffic.total_auto_losses_saved += 1

                    # Notify loser
                    await send_tracked(websocket, {
                        "type": "match_ended",
                        "winner": False,
                        "reason": "topped_out",
                        "winnerName": winner_name,
                        "auto_saved": True
                    })

                    # Notify winner
                    if opponent:
                        await send_tracked(opponent.websocket, {
                            "type": "match_ended",
                            "winner": True,
                            "reason": "opponent_topped_out",
                            "winnerName": winner_name
                        })

            # 8. Reactions
            elif msg_type == "reaction":
                room = manager.get_room_by_client(client_id)
                emoji = data.get("emoji", "🔥")
                if room:
                    await manager.send_to_opponent(room, client_id, {
                        "type": "opponent_reaction",
                        "emoji": emoji,
                        "sender": player_name
                    })

            # 9. Rematch
            elif msg_type == "rematch_request":
                room = manager.get_room_by_client(client_id)
                if room:
                    player = room.get_player(client_id)
                    if player:
                        player.rematch_requested = True
                    
                    opponent = room.get_opponent(client_id)
                    if opponent and opponent.rematch_requested:
                        room.seed = random.randint(100000, 999999)
                        for p in room.players.values():
                            p.is_ready = True
                            p.alive = True
                            p.rematch_requested = False
                        room.state = "countdown"
                        asyncio.create_task(run_game_countdown(room))
                    else:
                        await manager.send_to_opponent(room, client_id, {
                            "type": "rematch_offered",
                            "sender": player_name
                        })

    except WebSocketDisconnect:
        pass
    except Exception as e:
        print(f"WebSocket error for {client_id}: {e}")
    finally:
        traffic.active_ws_clients = max(0, traffic.active_ws_clients - 1)
        result = manager.leave(client_id)
        if result:
            room_id, leaver_name = result
            if room_id in manager.rooms:
                room = manager.rooms[room_id]
                await manager.broadcast(room, {
                    "type": "opponent_left",
                    "message": f"{leaver_name} abandonó la partida.",
                    "winner": True
                })


async def run_game_countdown(room: Room):
    """Runs 3, 2, 1, START! countdown before match begins"""
    for count in [3, 2, 1]:
        await manager.broadcast(room, {
            "type": "countdown",
            "count": count
        })
        traffic.total_ws_messages_out += len(room.players)
        await asyncio.sleep(1.0)

    room.state = "in_game"
    await manager.broadcast(room, {
        "type": "game_start",
        "seed": room.seed,
        "message": "¡A JUGAR!"
    })
    traffic.total_ws_messages_out += len(room.players)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
