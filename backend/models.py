from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any

class ScoreCreate(BaseModel):
    player_name: str = Field(default="Player", max_length=20)
    score: int = Field(ge=0)
    lines: int = Field(ge=0)
    level: int = Field(ge=1)
    mode: str = Field(default="solo")

class ScoreResponse(BaseModel):
    id: int
    player_name: str
    score: int
    lines: int
    level: int
    mode: str
    created_at: str

class LeaderboardResponse(BaseModel):
    status: str = "success"
    total: int
    scores: List[ScoreResponse]

class NextPieceRequest(BaseModel):
    player_id: Optional[str] = None
    level: int = 1
    count: int = 1

class NextPieceData(BaseModel):
    piece_type: str
    matrix: List[List[int]]
    piece_id: str
    generated_at: float

class NextPieceResponse(BaseModel):
    status: str = "ok"
    pieces: List[NextPieceData]
    server_time: float

class LossRecordRequest(BaseModel):
    player_name: str = "Player"
    score: int = Field(ge=0)
    lines: int = Field(ge=0)
    level: int = Field(ge=1)
    duration_seconds: int = 0
    outcome: str = "topped_out"
    mode: str = "solo"

class LossRecordResponse(BaseModel):
    status: str = "recorded"
    id: int
    player_name: str
    score: int
    lines: int
    level: int
    auto_saved: bool
    created_at: str

class TrafficLogItem(BaseModel):
    timestamp: str
    method: str
    endpoint: str
    status_code: int
    duration_ms: float
    client_ip: str
    bytes: int

class TrafficStatsResponse(BaseModel):
    total_http_requests: int
    total_pieces_generated: int
    total_auto_losses_saved: int
    total_ws_messages_in: int
    total_ws_messages_out: int
    active_ws_clients: int
    bytes_transferred: int
    server_uptime_seconds: float
    recent_requests: List[TrafficLogItem]
