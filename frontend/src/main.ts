import { sound } from './audio.ts';
import { ParticleSystem } from './particles.ts';
import { TetrisEngine } from './gameEngine.ts';
import { CanvasRenderer } from './renderer.ts';
import { NetworkManager } from './network.ts';
import { getDropInterval } from './constants.ts';
import type { GameMode, TetrominoType } from './types.ts';
import confetti from 'canvas-confetti';

// State Variables
let currentMode: GameMode = 'solo';
let playerName: string = localStorage.getItem('cybertetris_name') || `Pilot-${Math.floor(100 + Math.random() * 900)}`;
let currentRoomId: string = '';
let opponentName: string = 'Oponente';
let isInMatch: boolean = false;
let lastFrameTime: number = performance.now();

// DOM Elements
const screenLobby = document.getElementById('screen-lobby')!;
const screenQueue = document.getElementById('screen-queue')!;
const screenRoomLobby = document.getElementById('screen-room-lobby')!;
const screenGame = document.getElementById('screen-game')!;

const serverStatus = document.getElementById('server-status')!;
const serverText = document.getElementById('server-text')!;
const btnAudioToggle = document.getElementById('btn-audio-toggle')!;
const audioIcon = document.getElementById('audio-icon')!;

const playerNameInput = document.getElementById('player-name-input') as HTMLInputElement;
const btnRandomName = document.getElementById('btn-random-name')!;

// Lobby Buttons
const btnModeQuick = document.getElementById('btn-mode-quick')!;
const btnCreateRoom = document.getElementById('btn-create-room')!;
const btnJoinRoom = document.getElementById('btn-join-room')!;
const joinRoomCodeInput = document.getElementById('join-room-code-input') as HTMLInputElement;
const btnModeSolo = document.getElementById('btn-mode-solo')!;
const btnCancelQueue = document.getElementById('btn-cancel-queue')!;

const btnOpenLeaderboard = document.getElementById('btn-open-leaderboard')!;
const btnOpenControls = document.getElementById('btn-open-controls')!;

// Room Lobby Elements
const roomCodeDisplay = document.getElementById('room-code-display')!;
const btnCopyRoomCode = document.getElementById('btn-copy-room-code')!;
const slotName1 = document.getElementById('slot-name-1')!;
const slotName2 = document.getElementById('slot-name-2')!;
const slotStatus2 = document.getElementById('slot-status-2')!;
const btnRoomReady = document.getElementById('btn-room-ready')!;
const btnLeaveRoom = document.getElementById('btn-leave-room')!;

// In-Game Elements
const countdownOverlay = document.getElementById('countdown-overlay')!;
const countdownNumber = document.getElementById('countdown-number')!;
const displayPlayerName = document.getElementById('display-player-name')!;
const displayOpponentName = document.getElementById('display-opponent-name')!;
const opponentPanel = document.getElementById('opponent-panel')!;
const battleCenter = document.getElementById('battle-center')!;
const attackFeed = document.getElementById('attack-feed')!;
const garbageMeterBar = document.getElementById('garbage-meter-bar')!;
const btnSurrender = document.getElementById('btn-surrender')!;

const hudScore = document.getElementById('hud-score')!;
const hudLines = document.getElementById('hud-lines')!;
const hudLevel = document.getElementById('hud-level')!;
const hudSpeed = document.getElementById('hud-speed')!;
const hudTimer = document.getElementById('hud-timer')!;
const hudCombos = document.getElementById('hud-combos')!;
const oppHudScore = document.getElementById('opp-hud-score')!;
const oppHudLines = document.getElementById('opp-hud-lines')!;
const oppHudLevel = document.getElementById('opp-hud-level')!;

const levelUpBanner = document.getElementById('level-up-banner')!;
const levelUpText = document.getElementById('level-up-text')!;

// Modals
const modalLeaderboard = document.getElementById('modal-leaderboard')!;
const btnCloseLeaderboard = document.getElementById('btn-close-leaderboard')!;
const btnRefreshLeaderboard = document.getElementById('btn-refresh-leaderboard')!;
const leaderboardTbody = document.getElementById('leaderboard-tbody')!;

const modalControls = document.getElementById('modal-controls')!;
const btnCloseControls = document.getElementById('btn-close-controls')!;

const modalMatchResult = document.getElementById('modal-match-result')!;
const resultBadge = document.getElementById('result-badge')!;
const resultTitle = document.getElementById('result-title')!;
const resultDesc = document.getElementById('result-desc')!;
const resScore = document.getElementById('res-score')!;
const resLines = document.getElementById('res-lines')!;
const resSent = document.getElementById('res-sent')!;
const btnRequestRematch = document.getElementById('btn-request-rematch')!;
const btnResultLobby = document.getElementById('btn-result-lobby')!;

const modalSoloGameOver = document.getElementById('modal-solo-gameover')!;
const soloFinalScore = document.getElementById('solo-final-score')!;
const soloFinalLines = document.getElementById('solo-final-lines')!;
const soloFinalLevel = document.getElementById('solo-final-level')!;
const btnSaveScore = document.getElementById('btn-save-score') as HTMLButtonElement | null;
const saveStatusMsg = document.getElementById('save-status-msg');
const btnSoloRetry = document.getElementById('btn-solo-retry')!;
const btnSoloLobby = document.getElementById('btn-solo-lobby')!;

// Traffic Control Monitor DOM Elements
const btnOpenTraffic = document.getElementById('btn-open-traffic');
const btnOpenTrafficLobby = document.getElementById('btn-open-traffic-lobby');
const modalTraffic = document.getElementById('modal-traffic')!;
const btnCloseTraffic = document.getElementById('btn-close-traffic')!;
const btnRefreshTraffic = document.getElementById('btn-refresh-traffic')!;
const trafficCounterPill = document.getElementById('traffic-counter-pill');

const kpiHttp = document.getElementById('kpi-http');
const kpiPieces = document.getElementById('kpi-pieces');
const kpiLosses = document.getElementById('kpi-losses');
const kpiWs = document.getElementById('kpi-ws');
const kpiBytes = document.getElementById('kpi-bytes');
const trafficTableTbody = document.getElementById('traffic-table-tbody');

const floatingEmotesLayer = document.getElementById('floating-emotes-layer')!;

// Canvases
const canvasMain = document.getElementById('canvas-main') as HTMLCanvasElement;
const canvasHold = document.getElementById('canvas-hold') as HTMLCanvasElement;
const canvasNext = document.getElementById('canvas-next') as HTMLCanvasElement;
const canvasOpponent = document.getElementById('canvas-opponent') as HTMLCanvasElement;

// Initialize Core Subsystems
const particleSystem = new ParticleSystem();
const renderer = new CanvasRenderer(canvasMain, canvasHold, canvasNext, canvasOpponent);

// Screen Shake helper
function triggerScreenShake() {
  const wrapper = canvasMain.parentElement;
  if (wrapper) {
    wrapper.classList.remove('shake');
    void wrapper.offsetWidth; // trigger reflow
    wrapper.classList.add('shake');
    setTimeout(() => wrapper.classList.remove('shake'), 400);
  }
}

// Network Manager Instance
let boardUpdateThrottleTimer: number | null = null;

const network = new NetworkManager({
  onConnected: (id) => {
    serverStatus.classList.add('online');
    serverText.textContent = `Online (${id})`;
  },
  onRoomCreated: (roomId, _seed, _players) => {
    currentRoomId = roomId;
    roomCodeDisplay.textContent = roomId;
    slotName1.textContent = playerName;
    slotName2.textContent = 'Esperando rival...';
    slotStatus2.textContent = 'PENDIENTE';
    slotStatus2.className = 'slot-status';
    showScreen('room-lobby');
  },
  onRoomJoined: (roomId, _seed, players) => {
    currentRoomId = roomId;
    roomCodeDisplay.textContent = roomId;
    slotName1.textContent = playerName;
    if (players.length > 1) {
      opponentName = players.find((p) => p !== playerName) || 'Rival';
      slotName2.textContent = opponentName;
      slotStatus2.textContent = 'CONECTADO';
      slotStatus2.className = 'slot-status ready';
    }
    showScreen('room-lobby');
  },
  onOpponentJoined: (oppName) => {
    opponentName = oppName;
    slotName2.textContent = oppName;
    slotStatus2.textContent = 'CONECTADO';
    slotStatus2.className = 'slot-status ready';
  },
  onMatchFound: (roomId, _seed, oppName) => {
    currentRoomId = roomId;
    opponentName = oppName;
    displayPlayerName.textContent = playerName;
    displayOpponentName.textContent = opponentName;
    opponentPanel.style.display = 'flex';
    battleCenter.style.display = 'flex';
    showScreen('game');
    // Send ready to server
    network.sendReady();
  },
  onOpponentReady: () => {
    slotStatus2.textContent = '¡LISTO!';
    slotStatus2.className = 'slot-status ready';
  },
  onCountdown: (count) => {
    countdownOverlay.classList.add('active');
    countdownNumber.textContent = String(count);
    sound.playCountdown(false);
  },
  onGameStart: (seed) => {
    countdownNumber.textContent = '¡YA!';
    sound.playCountdown(true);
    setTimeout(() => {
      countdownOverlay.classList.remove('active');
    }, 700);

    isInMatch = true;
    engine.reset(seed);
  },
  onOpponentBoard: (data) => {
    renderer.renderOpponentBoard(data.matrix, data.currentPiece);
    oppHudScore.textContent = String(data.score);
    oppHudLines.textContent = String(data.lines);
    oppHudLevel.textContent = String(data.level);
  },
  onIncomingGarbage: (lines, hole, attacker) => {
    engine.queueGarbage(lines, hole);
    updateGarbageMeter();
    showAttackFeed(`+${lines} líneas de ${attacker}!`);
  },
  onGarbageSent: (lines) => {
    engine.stats.garbageSent += lines;
    showAttackFeed(`+${lines} líneas enviadas!`);
  },
  onOpponentReaction: (emoji, sender) => {
    spawnFloatingEmote(emoji, sender);
  },
  onMatchEnded: (isWinner, reason, winnerName) => {
    isInMatch = false;
    showMatchResults(isWinner, reason, winnerName);
  },
  onOpponentLeft: (_message) => {
    if (isInMatch) {
      isInMatch = false;
      showMatchResults(true, 'opponent_left', playerName);
    } else {
      slotName2.textContent = 'Rival desconectado';
      slotStatus2.textContent = 'DESCONECTADO';
      slotStatus2.className = 'slot-status';
    }
  },
  onRematchOffered: (sender) => {
    showAttackFeed(`${sender} solicitó revancha`);
    btnRequestRematch.textContent = 'Aceptar Revancha';
  },
  onError: (msg) => {
    alert(msg);
    showScreen('lobby');
  },
});

// Tetris Game Engine Instance
const engine = new TetrisEngine(
  {
    onBoardUpdate: () => {
      renderer.renderMainBoard(engine.matrix, engine.currentPiece, engine.getGhostY(), particleSystem);
      renderer.renderHold(engine.holdPiece, engine.canHold);
      renderer.renderNextQueue(engine.nextQueue);
      updateGarbageMeter();

      // Sync with opponent in 1v1 multiplayer
      if (currentMode !== 'solo' && isInMatch) {
        if (!boardUpdateThrottleTimer) {
          boardUpdateThrottleTimer = window.setTimeout(() => {
            network.sendBoardUpdate(
              engine.matrix,
              engine.stats.score,
              engine.stats.lines,
              engine.stats.level,
              engine.currentPiece,
              engine.holdPiece
            );
            boardUpdateThrottleTimer = null;
          }, 50);
        }
      }
    },
    onLinesCleared: (count, _isTetris) => {
      if (currentMode !== 'solo' && isInMatch && count >= 2) {
        network.sendLinesCleared(count);
      }
    },
    onGameOver: (stats) => {
      isInMatch = false;
      const duration = Math.max(1, Math.floor(engine.elapsedTimeMs / 1000));

      // 1. Auto-save defeat & match stats in backend SQLite (Generates POST /api/game/record-loss traffic)
      network.recordAutoLoss(
        playerName,
        stats.score,
        stats.lines,
        stats.level,
        duration,
        'topped_out',
        currentMode
      ).then(() => {
        updateTrafficUI();
      });

      // 2. Submit high score to global leaderboard in FastAPI
      network.submitScore(playerName, stats.score, stats.lines, stats.level, currentMode);

      if (currentMode === 'solo') {
        showSoloGameOver(stats);
      } else {
        network.sendGameOver();
      }
    },
    onScoreUpdate: (stats) => {
      hudScore.textContent = String(stats.score);
      hudLines.textContent = String(stats.lines);
      hudLevel.textContent = String(stats.level);
      hudCombos.textContent = `${stats.combos}x`;
    },
    onScreenShake: () => {
      triggerScreenShake();
    },
    onLevelUp: (newLevel, reason) => {
      sound.playLevelUp();
      const reasonLabel = reason === 'score' ? 'PUNTUACIÓN' : 'TIEMPO';
      levelUpText.textContent = `ACELERACIÓN: NIVEL ${newLevel} (${reasonLabel})`;
      levelUpBanner.classList.remove('show');
      void levelUpBanner.offsetWidth; // trigger reflow
      levelUpBanner.classList.add('show');
      triggerScreenShake();
      setTimeout(() => {
        levelUpBanner.classList.remove('show');
      }, 2600);
    },
    onTimeUpdate: (seconds) => {
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      hudTimer.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
      const currentInterval = getDropInterval(engine.stats.level);
      const speedMult = (850 / currentInterval).toFixed(1);
      hudSpeed.textContent = `${speedMult}x`;
    },
  },
  particleSystem
);

// Stream pieces from FastAPI backend RNG (Generates POST /api/game/next-piece traffic)
engine.pieceFetcher = async (count: number): Promise<TetrominoType[]> => {
  const pieces = await network.fetchNextPieces(count, engine.stats.level);
  return pieces as TetrominoType[];
};

// Navigation helper
function showScreen(screenId: 'lobby' | 'queue' | 'room-lobby' | 'game') {
  [screenLobby, screenQueue, screenRoomLobby, screenGame].forEach((s) => s.classList.remove('active'));

  if (screenId === 'lobby') screenLobby.classList.add('active');
  else if (screenId === 'queue') screenQueue.classList.add('active');
  else if (screenId === 'room-lobby') screenRoomLobby.classList.add('active');
  else if (screenId === 'game') screenGame.classList.add('active');
}

// Garbage Meter Bar Visualizer
function updateGarbageMeter() {
  const pending = engine.getPendingGarbageCount();
  const percentage = Math.min(100, (pending / 20) * 100);
  garbageMeterBar.style.height = `${percentage}%`;
}

// Attack Feed Alert
function showAttackFeed(text: string) {
  const pill = document.createElement('div');
  pill.className = 'attack-pill';
  pill.textContent = text;
  attackFeed.appendChild(pill);
  setTimeout(() => {
    pill.style.opacity = '0';
    setTimeout(() => pill.remove(), 300);
  }, 2500);
}

// Floating Emotes
function spawnFloatingEmote(emoji: string, sender?: string) {
  const el = document.createElement('div');
  el.className = 'floating-emote';
  el.textContent = emoji;
  el.style.left = `${30 + Math.random() * 40}%`;
  el.style.bottom = '20%';
  floatingEmotesLayer.appendChild(el);
  setTimeout(() => el.remove(), 2200);

  if (sender) {
    showAttackFeed(`${sender}: ${emoji}`);
  }
}

// Match Result Modal
function showMatchResults(isWinner: boolean, reason: string, winnerName: string) {
  modalMatchResult.classList.add('active');
  if (isWinner) {
    resultBadge.textContent = '¡VICTORIA!';
    resultBadge.className = 'result-badge victory';
    resultTitle.textContent = `¡HAS GANADO LA BATALLA!`;
    resultDesc.textContent = reason === 'opponent_left' ? 'Tu rival ha abandonado la partida.' : 'Tu rival ha superado el límite del tablero.';
    sound.playVictory();
    confetti({
      particleCount: 120,
      spread: 70,
      origin: { y: 0.6 },
    });
  } else {
    resultBadge.textContent = '¡DERROTA!';
    resultBadge.className = 'result-badge defeat';
    resultTitle.textContent = `VENCEDOR: ${winnerName}`;
    resultDesc.textContent = 'Has alcanzado la cima del tablero.';
    sound.playGameOver();
  }

  resScore.textContent = String(engine.stats.score);
  resLines.textContent = String(engine.stats.lines);
  resSent.textContent = String(engine.stats.garbageSent);
  btnRequestRematch.textContent = 'Solicitar Revancha';
}

// Solo Game Over Modal
function showSoloGameOver(stats: { score: number; lines: number; level: number }) {
  modalSoloGameOver.classList.add('active');
  soloFinalScore.textContent = String(stats.score);
  soloFinalLines.textContent = String(stats.lines);
  soloFinalLevel.textContent = String(stats.level);
  if (saveStatusMsg) {
    saveStatusMsg.textContent = '¡Estadísticas guardadas automáticamente en FastAPI (SQLite)!';
    saveStatusMsg.className = 'save-status-msg success';
  }
}

// Leaderboard Modal Renderer
async function loadAndRenderLeaderboard() {
  leaderboardTbody.innerHTML = `<tr><td colspan="6" class="table-loading">Cargando puntuaciones desde FastAPI...</td></tr>`;
  modalLeaderboard.classList.add('active');

  const scores = await network.getLeaderboard('solo', 20);
  if (scores.length === 0) {
    leaderboardTbody.innerHTML = `<tr><td colspan="6" class="table-loading">No hay puntuaciones registradas aún.</td></tr>`;
    return;
  }

  leaderboardTbody.innerHTML = scores
    .map((s, idx) => {
      const medal = `<span class="rank-badge rank-${idx + 1}">#${idx + 1}</span>`;
      return `
      <tr>
        <td>${medal}</td>
        <td><strong>${escapeHtml(s.player_name)}</strong></td>
        <td style="color: var(--cyan); font-weight: 700;">${s.score.toLocaleString()}</td>
        <td>${s.lines}</td>
        <td>${s.level}</td>
        <td style="color: var(--text-muted); font-size: 0.8rem;">${s.created_at}</td>
      </tr>
    `;
    })
    .join('');
}

function escapeHtml(str: string): string {
  return str.replace(/[&<>'"]/g, (tag) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag));
}

// Live Traffic Control Monitor UI Updater
async function updateTrafficUI() {
  const data = await network.getTrafficStats();
  if (!data) return;

  if (trafficCounterPill) trafficCounterPill.textContent = String(data.total_http_requests);
  if (kpiHttp) kpiHttp.textContent = String(data.total_http_requests);
  if (kpiPieces) kpiPieces.textContent = String(data.total_pieces_generated);
  if (kpiLosses) kpiLosses.textContent = String(data.total_auto_losses_saved);
  const totalWs = (data.total_ws_messages_in || 0) + (data.total_ws_messages_out || 0);
  if (kpiWs) kpiWs.textContent = String(totalWs);

  if (kpiBytes) {
    const bytes = data.bytes_transferred || 0;
    kpiBytes.textContent = bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
  }

  if (trafficTableTbody && data.recent_requests) {
    if (data.recent_requests.length === 0) {
      trafficTableTbody.innerHTML = `<tr><td colspan="6" class="table-loading">Sin peticiones registradas aún. Juega para generar tráfico.</td></tr>`;
    } else {
      trafficTableTbody.innerHTML = data.recent_requests
        .map((r: any) => {
          const methodClass = r.method === 'GET' ? 'traffic-method-get' : r.method === 'POST' ? 'traffic-method-post' : 'traffic-method-ws';
          const statusClass = r.status_code >= 200 && r.status_code < 300 ? 'traffic-status-ok' : 'traffic-status-err';
          return `
            <tr>
              <td>${escapeHtml(r.timestamp)}</td>
              <td><span class="${methodClass}">${escapeHtml(r.method)}</span></td>
              <td><code>${escapeHtml(r.endpoint)}</code></td>
              <td><span class="${statusClass}">${r.status_code}</span></td>
              <td>${r.duration_ms} ms</td>
              <td>${r.bytes} B</td>
            </tr>
          `;
        })
        .join('');
    }
  }
}

// Setup Event Listeners
function initEventListeners() {
  // Audio Mute Toggle with SVG Icons
  function renderAudioIcon(isMuted: boolean) {
    audioIcon.innerHTML = isMuted
      ? `<svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none"><path d="M11 5L6 9H2v6h4l5 4V5z"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>`
      : `<svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none"><path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>`;
  }

  btnAudioToggle.addEventListener('click', () => {
    const isMuted = sound.toggleMute();
    renderAudioIcon(isMuted);
  });
  renderAudioIcon(sound.isMuted);

  // Player Name Input & Randomizer
  playerNameInput.value = playerName;
  playerNameInput.addEventListener('input', () => {
    playerName = playerNameInput.value.trim() || 'Player';
    localStorage.setItem('cybertetris_name', playerName);
  });

  const sampleNames = ['NeonBlade', 'CyberGhost', 'MatrixPilot', 'VortexPro', 'QuantumZero', 'LaserRunner', 'PixelHero'];
  btnRandomName.addEventListener('click', () => {
    playerName = `${sampleNames[Math.floor(Math.random() * sampleNames.length)]}-${Math.floor(10 + Math.random() * 89)}`;
    playerNameInput.value = playerName;
    localStorage.setItem('cybertetris_name', playerName);
  });

  // Solo Mode
  btnModeSolo.addEventListener('click', () => {
    currentMode = 'solo';
    displayPlayerName.textContent = playerName;
    opponentPanel.style.display = 'none';
    battleCenter.style.display = 'none';
    showScreen('game');
    isInMatch = true;
    engine.reset();
  });

  // Quick Match
  btnModeQuick.addEventListener('click', () => {
    currentMode = 'multiplayer_quick';
    showScreen('queue');
    network.connect();
    network.joinQueue(playerName);
  });

  btnCancelQueue.addEventListener('click', () => {
    showScreen('lobby');
  });

  // Create Room
  btnCreateRoom.addEventListener('click', () => {
    currentMode = 'multiplayer_room';
    network.connect();
    network.createRoom(playerName);
  });

  // Join Room
  btnJoinRoom.addEventListener('click', () => {
    const code = joinRoomCodeInput.value.trim().toUpperCase();
    if (!code) {
      alert('Ingresa el código de 6 dígitos de la sala');
      return;
    }
    currentMode = 'multiplayer_room';
    network.connect();
    network.joinRoom(code, playerName);
  });

  // Room Lobby Ready Button
  btnRoomReady.addEventListener('click', () => {
    network.sendReady();
    btnRoomReady.textContent = '¡PREPARADO!';
    btnRoomReady.classList.add('ready');
  });

  btnLeaveRoom.addEventListener('click', () => {
    showScreen('lobby');
  });

  btnCopyRoomCode.addEventListener('click', () => {
    navigator.clipboard.writeText(currentRoomId);
    btnCopyRoomCode.textContent = 'COPIADO';
    setTimeout(() => (btnCopyRoomCode.textContent = 'COPIAR'), 2000);
  });

  // In-Game Surrender / Leave
  btnSurrender.addEventListener('click', () => {
    if (confirm('¿Deseas salir al menú principal?')) {
      isInMatch = false;
      showScreen('lobby');
    }
  });

  // Reaction Emotes (Cyber quick-chat tags)
  document.querySelectorAll('.btn-emote').forEach((btn) => {
    btn.addEventListener('click', () => {
      const emote = btn.getAttribute('data-emoji') || 'GG';
      spawnFloatingEmote(emote);
      if (currentMode !== 'solo') {
        network.sendReaction(emote);
      }
    });
  });

  // Leaderboard Modal
  btnOpenLeaderboard.addEventListener('click', loadAndRenderLeaderboard);
  btnCloseLeaderboard.addEventListener('click', () => modalLeaderboard.classList.remove('active'));
  btnRefreshLeaderboard.addEventListener('click', loadAndRenderLeaderboard);

  // Controls Modal
  btnOpenControls.addEventListener('click', () => modalControls.classList.add('active'));
  btnCloseControls.addEventListener('click', () => modalControls.classList.remove('active'));

  // Traffic Monitor Modal Handlers
  btnOpenTraffic?.addEventListener('click', () => {
    modalTraffic.classList.add('active');
    updateTrafficUI();
  });
  btnOpenTrafficLobby?.addEventListener('click', () => {
    modalTraffic.classList.add('active');
    updateTrafficUI();
  });
  btnCloseTraffic?.addEventListener('click', () => modalTraffic.classList.remove('active'));
  btnRefreshTraffic?.addEventListener('click', updateTrafficUI);

  // Modals backdrop close
  [modalLeaderboard, modalControls, modalTraffic].forEach((m) => {
    m.addEventListener('click', (e) => {
      if (e.target === m) m.classList.remove('active');
    });
  });

  // Solo Game Over optional manual retry button
  if (btnSaveScore) {
    btnSaveScore.addEventListener('click', async () => {
      btnSaveScore.disabled = true;
      btnSaveScore.textContent = 'Guardando en FastAPI...';
      const result = await network.submitScore(playerName, engine.stats.score, engine.stats.lines, engine.stats.level, 'solo');
      if (result) {
        if (saveStatusMsg) {
          saveStatusMsg.textContent = '¡Puntuación guardada con éxito en el servidor!';
          saveStatusMsg.className = 'save-status-msg success';
        }
        btnSaveScore.textContent = 'Guardado';
      } else {
        if (saveStatusMsg) {
          saveStatusMsg.textContent = 'Error al conectar con el backend.';
          saveStatusMsg.className = 'save-status-msg error';
        }
        btnSaveScore.disabled = false;
        btnSaveScore.textContent = 'Reintentar Guardar';
      }
    });
  }

  btnSoloRetry.addEventListener('click', () => {
    modalSoloGameOver.classList.remove('active');
    isInMatch = true;
    engine.reset();
  });

  btnSoloLobby.addEventListener('click', () => {
    modalSoloGameOver.classList.remove('active');
    showScreen('lobby');
  });

  // Match Result Modal Actions
  btnRequestRematch.addEventListener('click', () => {
    modalMatchResult.classList.remove('active');
    btnRequestRematch.textContent = 'Esperando al rival...';
    network.sendRematchRequest();
  });

  btnResultLobby.addEventListener('click', () => {
    modalMatchResult.classList.remove('active');
    showScreen('lobby');
  });

  // Mobile Touch Controls & Gestures
  initTouchControls();

  // ─── DAS / ARR Keyboard System (competitive-grade responsiveness) ───
  // DAS = Delayed Auto Shift: initial delay before auto-repeat starts
  // ARR = Auto Repeat Rate: interval between repeated actions once DAS fires
  // Tuned for instant responsiveness (snappy competitive feel)
  const DAS_DELAY = 65;     // ms before auto-repeat starts (reduced from 100ms for fast onset)
  const ARR_INTERVAL = 12;  // ms between repeated moves (reduced from 30ms for ultra-fast gliding)
  const SOFT_DROP_DAS = 25; // ms before soft drop repeat kicks in (near instantaneous)
  const SOFT_DROP_ARR = 8;  // ms between soft drop steps (instantaneous drop)

  interface KeyState {
    action: () => void;
    dasTimer: number | null;
    arrTimer: number | null;
  }

  const activeKeys: Map<string, KeyState> = new Map();
  const heldPhysicalKeys = new Set<string>();

  const LEFT_CODES = ['ArrowLeft', 'KeyA'];
  const RIGHT_CODES = ['ArrowRight', 'KeyD'];
  const DOWN_CODES = ['ArrowDown', 'KeyS'];

  function isLeftKey(code: string) { return LEFT_CODES.includes(code); }
  function isRightKey(code: string) { return RIGHT_CODES.includes(code); }

  function stopKeyRepeat(code: string) {
    const entry = activeKeys.get(code);
    if (entry) {
      if (entry.dasTimer) clearTimeout(entry.dasTimer);
      if (entry.arrTimer) clearInterval(entry.arrTimer);
      activeKeys.delete(code);
    }
  }

  function startKeyRepeat(code: string) {
    const repeatAction = getKeyAction(code);
    if (!repeatAction) return;
    if (activeKeys.has(code)) return; // already active

    // Execute immediately on press with zero delay
    repeatAction();

    const isSoftDrop = DOWN_CODES.includes(code);
    const dasDelay = isSoftDrop ? SOFT_DROP_DAS : DAS_DELAY;
    const arrRate = isSoftDrop ? SOFT_DROP_ARR : ARR_INTERVAL;

    const dasTimer = window.setTimeout(() => {
      const arrTimer = window.setInterval(() => {
        if (!isInMatch || engine.isGameOver) {
          stopKeyRepeat(code);
          return;
        }
        repeatAction();
      }, arrRate);

      const entry = activeKeys.get(code);
      if (entry) {
        entry.arrTimer = arrTimer;
      }
    }, dasDelay);

    activeKeys.set(code, { action: repeatAction, dasTimer, arrTimer: null });
  }

  function getKeyAction(code: string): (() => void) | null {
    switch (code) {
      case 'ArrowLeft':
      case 'KeyA':
        return () => engine.moveLeft();
      case 'ArrowRight':
      case 'KeyD':
        return () => engine.moveRight();
      case 'ArrowDown':
      case 'KeyS':
        return () => engine.softDrop();
      default:
        return null;
    }
  }

  window.addEventListener('keydown', (e) => {
    if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return;
    if (!isInMatch || engine.isGameOver) return;

    const code = e.code;
    heldPhysicalKeys.add(code);

    // Repeatable keys with high-speed DAS/ARR and opposing direction resolution
    const repeatAction = getKeyAction(code);
    if (repeatAction) {
      e.preventDefault();
      if (activeKeys.has(code)) return; // already repeating this key

      // Priority cancellation: pressing opposite direction cancels the active one immediately
      if (isLeftKey(code)) {
        RIGHT_CODES.forEach(stopKeyRepeat);
      } else if (isRightKey(code)) {
        LEFT_CODES.forEach(stopKeyRepeat);
      }

      startKeyRepeat(code);
      return;
    }

    // Non-repeatable keys (instant, single action)
    switch (code) {
      case 'Space':
        engine.hardDrop();
        e.preventDefault();
        break;
      case 'ArrowUp':
      case 'KeyX':
      case 'KeyW':
        engine.rotate(1);
        e.preventDefault();
        break;
      case 'KeyZ':
        engine.rotate(-1);
        e.preventDefault();
        break;
      case 'KeyC':
      case 'ShiftLeft':
      case 'ShiftRight':
        engine.hold();
        e.preventDefault();
        break;
    }
  });

  window.addEventListener('keyup', (e) => {
    const code = e.code;
    heldPhysicalKeys.delete(code);

    stopKeyRepeat(code);

    // If an opposing horizontal direction is still held physically, immediately reactivate it
    if (isLeftKey(code)) {
      const stillHeldRight = RIGHT_CODES.find(k => heldPhysicalKeys.has(k));
      if (stillHeldRight && !activeKeys.has(stillHeldRight)) {
        startKeyRepeat(stillHeldRight);
      }
    } else if (isRightKey(code)) {
      const stillHeldLeft = LEFT_CODES.find(k => heldPhysicalKeys.has(k));
      if (stillHeldLeft && !activeKeys.has(stillHeldLeft)) {
        startKeyRepeat(stillHeldLeft);
      }
    }
  });

  // Clear all active keys when window loses focus
  window.addEventListener('blur', () => {
    activeKeys.forEach((entry) => {
      if (entry.dasTimer) clearTimeout(entry.dasTimer);
      if (entry.arrTimer) clearInterval(entry.arrTimer);
    });
    activeKeys.clear();
    heldPhysicalKeys.clear();
  });
}

// Mobile Virtual Gamepad & Screen Touch Gestures
function initTouchControls() {
  const btnLeft = document.getElementById('touch-btn-left');
  const btnRight = document.getElementById('touch-btn-right');
  const btnSoftDrop = document.getElementById('touch-btn-soft-drop');
  const btnHardDrop = document.getElementById('touch-btn-hard-drop');
  const btnRotCw = document.getElementById('touch-btn-rot-cw');
  const btnRotCcw = document.getElementById('touch-btn-rot-ccw');
  const btnHold = document.getElementById('touch-btn-hold');

  function bindContinuous(el: HTMLElement | null, action: () => void, initialDelay = 60, repeatInterval = 14) {
    if (!el) return;
    let timer: number | null = null;
    let intervalTimer: number | null = null;

    const start = (e: Event) => {
      e.preventDefault();
      if (!isInMatch || engine.isGameOver) return;
      el.classList.add('active');
      action();

      if (timer) clearTimeout(timer);
      if (intervalTimer) clearInterval(intervalTimer);

      timer = window.setTimeout(() => {
        intervalTimer = window.setInterval(() => {
          if (!isInMatch || engine.isGameOver) {
            stop();
            return;
          }
          action();
        }, repeatInterval);
      }, initialDelay);
    };

    const stop = (e?: Event) => {
      if (e) e.preventDefault();
      el.classList.remove('active');
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (intervalTimer) {
        clearInterval(intervalTimer);
        intervalTimer = null;
      }
    };

    el.addEventListener('touchstart', start, { passive: false });
    el.addEventListener('touchend', stop, { passive: false });
    el.addEventListener('touchcancel', stop, { passive: false });
    el.addEventListener('mousedown', start);
    el.addEventListener('mouseup', stop);
    el.addEventListener('mouseleave', stop);
  }

  function bindSingle(el: HTMLElement | null, action: () => void) {
    if (!el) return;
    const trigger = (e: Event) => {
      e.preventDefault();
      if (!isInMatch || engine.isGameOver) return;
      el.classList.add('active');
      setTimeout(() => el.classList.remove('active'), 120);
      action();
    };

    el.addEventListener('touchstart', trigger, { passive: false });
    el.addEventListener('mousedown', trigger);
  }

  bindContinuous(btnLeft, () => engine.moveLeft(), 60, 14);
  bindContinuous(btnRight, () => engine.moveRight(), 60, 14);
  bindContinuous(btnSoftDrop, () => engine.softDrop(), 30, 8);

  bindSingle(btnHardDrop, () => engine.hardDrop());
  bindSingle(btnRotCw, () => engine.rotate(1));
  bindSingle(btnRotCcw, () => engine.rotate(-1));
  bindSingle(btnHold, () => engine.hold());

  // Board Touch Gestures (drag/tap directly on canvas)
  let touchStartX = 0;
  let touchStartY = 0;
  let lastSwipeX = 0;
  let touchStartTime = 0;

  canvasMain.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return;
    e.preventDefault();
    const touch = e.touches[0];
    touchStartX = touch.clientX;
    touchStartY = touch.clientY;
    lastSwipeX = touch.clientX;
    touchStartTime = performance.now();
  }, { passive: false });

  canvasMain.addEventListener('touchmove', (e) => {
    if (e.touches.length !== 1 || !isInMatch || engine.isGameOver) return;
    e.preventDefault();
    const touch = e.touches[0];
    const dx = touch.clientX - lastSwipeX;
    const dy = touch.clientY - touchStartY;
    const colThreshold = 10;

    if (Math.abs(dx) >= colThreshold) {
      const steps = Math.trunc(dx / colThreshold);
      for (let i = 0; i < Math.abs(steps); i++) {
        if (steps > 0) engine.moveRight();
        else engine.moveLeft();
      }
      lastSwipeX += steps * colThreshold;
    }

    if (dy > 14) {
      engine.softDrop();
      touchStartY = touch.clientY;
    }
  }, { passive: false });

  canvasMain.addEventListener('touchend', (e) => {
    e.preventDefault();
    if (!isInMatch || engine.isGameOver) return;
    const duration = performance.now() - touchStartTime;
    const totalDistX = Math.abs((e.changedTouches[0]?.clientX || touchStartX) - touchStartX);
    const totalDistY = (e.changedTouches[0]?.clientY || touchStartY) - touchStartY;

    // Quick tap -> rotate
    if (duration < 180 && totalDistX < 15 && Math.abs(totalDistY) < 15) {
      engine.rotate(1);
    } else if (totalDistY > 50 && duration < 220) {
      // Swipe down -> Hard drop
      engine.hardDrop();
    } else if (totalDistY < -40 && duration < 260) {
      // Swipe up -> Hold
      engine.hold();
    }
  }, { passive: false });
}

// Main Animation & Game Loop
function gameLoop(now: number) {
  const delta = now - lastFrameTime;
  lastFrameTime = now;

  particleSystem.update();

  if (isInMatch && !engine.isGameOver) {
    engine.update(delta);
    renderer.renderMainBoard(engine.matrix, engine.currentPiece, engine.getGhostY(), particleSystem);
  }

  requestAnimationFrame(gameLoop);
}

// Initial Boot
async function startApp() {
  initEventListeners();
  network.connect();

  // Test backend connection
  const health = await network.getHealth();
  if (health) {
    serverStatus.classList.add('online');
    serverText.textContent = `Online (FastAPI)`;
  } else {
    serverText.textContent = `Desconectado`;
  }

  // Update server traffic counters and start live background polling
  updateTrafficUI();
  setInterval(updateTrafficUI, 2500);

  // Initial dummy render
  renderer.renderMainBoard(engine.matrix, engine.currentPiece, engine.getGhostY());
  renderer.renderHold(null, true);
  renderer.renderNextQueue(engine.nextQueue);

  // Start Animation Loop
  requestAnimationFrame(gameLoop);
}

startApp();
