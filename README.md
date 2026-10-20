# 🕹️ CyberTetris Online (FastAPI + TypeScript)

Un juego completo de **Tetris competitivo en tiempo real** para navegador, desarrollado con un backend en **FastAPI (Python)** y un frontend moderno en **TypeScript con Vite**.

---

## 🚀 Arquitectura del Proyecto

```
Tetris/
├── backend/                  # Servidor FastAPI (Python)
│   ├── main.py              # Endpoints REST y servidor WebSocket en tiempo real
│   ├── database.py          # Persistencia SQLite (Leaderboard y puntuaciones)
│   ├── models.py            # Esquemas Pydantic
│   ├── rooms.py             # Gestor de salas 1v1, emparejamiento y cálculo de basura
│   └── requirements.txt     # Dependencias Python (fastapi, uvicorn, websockets)
│
├── frontend/                 # Cliente de juego (TypeScript + Vite)
│   ├── index.html           # Estructura del juego (Lobby, Radar, Arena 1v1 y Modales)
│   ├── src/
│   │   ├── main.ts          # Controlador principal y bucle de juego
│   │   ├── gameEngine.ts    # Motor de Tetris (SRS, 7-bag seeded, hold, ghost, combos)
│   │   ├── renderer.ts      # Renderizado Canvas para tablero principal, hold, next y rival
│   │   ├── network.ts       # Cliente REST API y WebSockets
│   │   ├── audio.ts         # Sintetizador de efectos de sonido retro 8-bit (Web Audio API)
│   │   ├── particles.ts     # Sistema de partículas de explosión y fuegos artificiales
│   │   ├── constants.ts     # Paleta de colores neon cyberpunk, SRS kick tables y formas
│   │   ├── types.ts         # Definiciones e interfaces de TypeScript
│   │   └── style.css        # Sistema de diseño Cyberpunk con Glassmorphism y animaciones
│   ├── package.json
│   └── tsconfig.json
```

---

## 🎮 Modos de Juego

1. **⚡ Partida Rápida (1v1 Matchmaking):**
   - Entra en la cola de emparejamiento con radar animado.
   - Tan pronto como otro jugador se conecte, se inicia una partida sincronizada con cuenta atrás 3, 2, 1.
   - Ambos jugadores reciben la misma secuencia de piezas gracias a la semilla sincronizada (`seed`).
   - El tablero del rival se muestra en tiempo real en la pantalla.
   - **Mecánica de ataque:** Al limpiar 2, 3 o 4 líneas (¡TETRIS!), se envían líneas de basura al oponente con un hueco aleatorio.

2. **🔑 Sala Privada (1v1 con Código):**
   - Crea una sala y comparte el código de 6 caracteres con un amigo.
   - Ambos jugadores pulsan "¡ESTOY LISTO!" para iniciar el combate.

3. **🎮 Modo Clásico (Solitario):**
   - Juega para conseguir la máxima puntuación posible.
   - Al terminar la partida, registra tu puntuación directamente en el **Ranking Global de FastAPI** con SQLite.

---

## ⚡ Dificultad Dinámica Automática (Puntuación o Tiempo)

La dificultad y la velocidad de caída de las piezas aumentan automáticamente durante la partida en función de **la puntuación obtenida** o **el tiempo transcurrido**:

1. **Aumento por Puntuación (Habilidad y Ataques):**
   - A medida que consigues puntos (haciendo líneas simples, dobles, triples o ¡TETRIS!), el nivel y la velocidad aumentan de forma inmediata.
   - Si juegas de forma agresiva y acumulas combos, el juego escala la velocidad rápidamente para poner a prueba tu destreza.

2. **Aumento por Tiempo de Supervivencia:**
   - Cada **20 segundos** que sobrevives en la partida sin perder, el juego sube automáticamente +1 Nivel de dificultad, incluso si juegas defensivo o lento.
   - El nivel efectivo en cada momento es el mayor entre el nivel dictado por tus puntos y el dictado por el reloj (`Math.max(nivelPuntos, nivelTiempo)`).

3. **Feedback en Tiempo Real:**
   - **⏱️ Temporizador**: Muestra los minutos y segundos transcurridos en el HUD.
   - **⚡ Multiplicador de Velocidad**: Refleja la aceleración actual de caída (`1.0x`, `1.4x`, `2.1x`, `3.2x`...).
   - **Banner y Efecto de Sonido**: Cada vez que sube la velocidad, se muestra una alerta animada en pantalla indicando la causa (*"🎯 ¡ACELERACIÓN: NIVEL X! (PUNTUACIÓN)"* o *"⏱️ ¡ACELERACIÓN: NIVEL X! (TIEMPO)"*) acompañada de un sonido especial de sintetizador.
   - **Margen de Maniobra (*Lock Delay*)**: A niveles altos, el tiempo para deslizar piezas en el suelo se ajusta de 500ms a 220ms para una experiencia arcade auténtica.

---

## ⌨️ Controles

| Tecla | Acción |
|---|---|
| `←` / `A` | Mover a la izquierda |
| `→` / `D` | Mover a la derecha |
| `↓` / `S` | Caída suave (Soft Drop - +1 pt) |
| `Espacio` | Caída instantánea (Hard Drop - +2 pts/celda) |
| `↑` / `W` / `X` | Rotar en sentido horario (con sistema SRS) |
| `Z` | Rotar en sentido antihorario |
| `C` / `Shift` | Guardar pieza (Hold) |
| Emotes en pantalla | Reaccionar en directo con emojis (🔥, ⚡, 😱, 😎, GG) |

---

## 📊 Sistema de Generación y Control de Tráfico en el Servidor (FastAPI)

Este proyecto está especialmente diseñado para **generar tráfico constante y trazable** hacia el servidor backend con el fin de alimentar sistemas de **monitorización y control de tráfico de red**:

### 1. 🎲 Generador de Piezas en el Backend (`POST /api/game/next-piece`)
- En lugar de que el navegador decida siempre las piezas localmente, el cliente de juego realiza peticiones HTTP periódicas al backend para rellenar la cola de piezas futuras (*Next Queue*).
- El servidor ejecuta un algoritmo **7-Bag con RNG en Python**, asigna identificadores únicos a cada pieza (`pc-xxxx`) y registra la latencia y volumen de datos transferidos.
- **Tolerancia a fallos**: El cliente mantiene un buffer de piezas; si hubiera micro-cortes en la red, el generador local actúa como respaldo transparente para garantizar 60 FPS sin interrupciones.

### 2. 💾 Registro Automático de Derrotas (`POST /api/game/record-loss`)
- Cada vez que un jugador pierde una partida (tanto en solitario al superar el límite del tablero como en multijugador 1v1), el cliente envía una petición HTTP inmediata al backend.
- El servidor guarda de forma automática en una tabla SQLite (`game_logs`) los siguientes datos:
  - Nombre del jugador.
  - Puntuación, líneas y nivel alcanzado.
  - Tiempo de supervivencia exacto en segundos.
  - Razón del fin de partida (`topped_out`, `surrender`, etc.).
  - Dirección IP del cliente y marca de tiempo ISO.

### 3. 📡 Monitor de Tráfico en Tiempo Real (`GET /api/traffic`)
El juego incluye un **panel interactivo de control de tráfico** accesible desde el botón superior *"Tráfico: X reqs"* o desde el botón *"Monitor de Tráfico"* en el lobby:
- **KPIs en Vivo:**
  - Peticiones HTTP totales recibidas por el servidor.
  - Piezas generadas por el RNG del backend.
  - Derrotas auto-guardadas en la base de datos.
  - Mensajes de WebSocket intercambiados (entrada/salida).
  - Bytes totales transferidos (KB / MB).
- **Feed de Peticiones en Vivo (Live Log Table):** Tabla con las últimas peticiones atendidas por FastAPI, detallando método (`GET`, `POST`), endpoint, código de respuesta HTTP (`200 OK`, `422`), tiempo de latencia en milisegundos (`ms`) y tamaño del payload en bytes.

---

## 🛠️ Cómo Iniciar el Proyecto

### 1. Iniciar el Backend (FastAPI):
En una terminal:
```bash
cd backend
python -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```
- API REST: `http://127.0.0.1:8000/api/health`
- WebSocket: `ws://127.0.0.1:8000/ws`
- Monitor de Tráfico JSON: `http://127.0.0.1:8000/api/traffic`
- Documentación interactiva Swagger: `http://127.0.0.1:8000/docs`

### 2. Iniciar el Frontend (TypeScript + Vite):
En otra terminal:
```bash
cd frontend
npm run dev
```
Abre en tu navegador favorito:
👉 **`http://127.0.0.1:5173`**

