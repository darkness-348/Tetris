@echo off
title CyberTetris Launcher
echo ========================================================
echo        INICIANDO CYBERTETRIS ONLINE (FastAPI + TS)
echo ========================================================

start "FastAPI Backend" cmd /k "cd backend && python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload"
timeout /t 2 /nobreak > nul

start "TypeScript Frontend" cmd /k "cd frontend && npm.cmd run dev -- --host 0.0.0.0"
timeout /t 2 /nobreak > nul

echo.
echo Servidores en ejecucion:
echo - Local (PC):        http://localhost:5173
echo - Celular / Red:     Abre la direccion IP de tu PC con puerto :5173
echo.
start http://localhost:5173
pause
