import asyncio
import json
import random
import string
import time
from typing import Dict, List, Optional, Tuple
from fastapi import WebSocket

class Player:
    def __init__(self, client_id: str, name: str, websocket: WebSocket):
        self.client_id = client_id
        self.name = name
        self.websocket = websocket
        self.is_ready = False
        self.alive = True
        self.score = 0
        self.lines = 0
        self.level = 1
        self.rematch_requested = False

class Room:
    def __init__(self, room_id: str):
        self.room_id = room_id
        self.players: Dict[str, Player] = {}
        self.state: str = "waiting"  # "waiting", "countdown", "in_game", "game_over"
        self.seed: int = random.randint(100000, 999999)
        self.winner_id: Optional[str] = None
        self.created_at: float = time.time()

    def is_full(self) -> bool:
        return len(self.players) >= 2

    def get_opponent(self, client_id: str) -> Optional[Player]:
        for pid, player in self.players.items():
            if pid != client_id:
                return player
        return None

    def get_player(self, client_id: str) -> Optional[Player]:
        return self.players.get(client_id)

    def to_dict(self) -> Dict:
        return {
            "room_id": self.room_id,
            "players": [p.name for p in self.players.values()],
            "player_count": len(self.players),
            "state": self.state
        }

class RoomManager:
    def __init__(self):
        self.rooms: Dict[str, Room] = {}
        self.player_room_map: Dict[str, str] = {}
        self.matchmaking_queue: List[Tuple[str, str, WebSocket]] = []

    def generate_room_id(self) -> str:
        for _ in range(20):
            code = "".join(random.choices(string.ascii_uppercase + string.digits, k=6))
            if code not in self.rooms:
                return code
        return str(random.randint(100000, 999999))

    def create_room(self, client_id: str, name: str, websocket: WebSocket) -> Room:
        self.leave(client_id)
        room_id = self.generate_room_id()
        room = Room(room_id)
        player = Player(client_id, name, websocket)
        room.players[client_id] = player
        self.rooms[room_id] = room
        self.player_room_map[client_id] = room_id
        return room

    def join_room(self, room_id: str, client_id: str, name: str, websocket: WebSocket) -> Tuple[Optional[Room], Optional[str]]:
        self.leave(client_id)
        room_id_upper = room_id.strip().upper()
        if room_id_upper not in self.rooms:
            return None, "La sala no existe."

        room = self.rooms[room_id_upper]
        if room.is_full():
            return None, "La sala ya está llena (máximo 2 jugadores para 1v1)."

        if room.state != "waiting":
            return None, "La partida en esta sala ya ha comenzado."

        player = Player(client_id, name, websocket)
        room.players[client_id] = player
        self.player_room_map[client_id] = room_id_upper
        return room, None

    def join_matchmaking(self, client_id: str, name: str, websocket: WebSocket) -> Tuple[Optional[Room], bool]:
        self.leave(client_id)
        
        # Clean disconnected queue entries
        self.matchmaking_queue = [
            (cid, cname, cws) for (cid, cname, cws) in self.matchmaking_queue
            if cid != client_id and cws.client_state.name == "CONNECTED"
        ]

        if len(self.matchmaking_queue) > 0:
            opponent_id, opponent_name, opponent_ws = self.matchmaking_queue.pop(0)
            room_id = self.generate_room_id()
            room = Room(room_id)

            p1 = Player(opponent_id, opponent_name, opponent_ws)
            p2 = Player(client_id, name, websocket)

            room.players[opponent_id] = p1
            room.players[client_id] = p2

            self.rooms[room_id] = room
            self.player_room_map[opponent_id] = room_id
            self.player_room_map[client_id] = room_id

            return room, True  # Matched!
        else:
            self.matchmaking_queue.append((client_id, name, websocket))
            return None, False  # Waiting in queue

    def leave(self, client_id: str) -> Optional[Tuple[str, str]]:
        # Remove from matchmaking queue
        self.matchmaking_queue = [
            (cid, cname, cws) for (cid, cname, cws) in self.matchmaking_queue
            if cid != client_id
        ]

        room_id = self.player_room_map.pop(client_id, None)
        if not room_id or room_id not in self.rooms:
            return None

        room = self.rooms[room_id]
        leaving_player = room.players.pop(client_id, None)
        leaving_name = leaving_player.name if leaving_player else "Jugador"

        if len(room.players) == 0:
            # Delete room if empty
            del self.rooms[room_id]
        else:
            # Opponent is left alone
            room.state = "game_over"
            remaining_player = list(room.players.values())[0]
            room.winner_id = remaining_player.client_id

        return room_id, leaving_name

    def get_room_by_client(self, client_id: str) -> Optional[Room]:
        room_id = self.player_room_map.get(client_id)
        if room_id:
            return self.rooms.get(room_id)
        return None

    async def broadcast(self, room: Room, message: dict):
        payload = json.dumps(message)
        for player in list(room.players.values()):
            try:
                await player.websocket.send_text(payload)
            except Exception:
                pass

    async def send_to_opponent(self, room: Room, sender_id: str, message: dict):
        opponent = room.get_opponent(sender_id)
        if opponent:
            try:
                await opponent.websocket.send_text(json.dumps(message))
            except Exception:
                pass

    def calculate_garbage_lines(self, lines_cleared: int) -> int:
        if lines_cleared == 2:
            return 1
        elif lines_cleared == 3:
            return 2
        elif lines_cleared >= 4:
            return 4  # Tetris attack!
        return 0

manager = RoomManager()
