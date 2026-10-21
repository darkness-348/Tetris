@echo off
title CyberTetris Docker Launcher
echo ========================================================
echo   INICIANDO CYBERTETRIS CON DOCKER (PostgreSQL + FastAPI + TS)
echo ========================================================
echo.
echo Levantando contenedores con Docker Compose...
docker compose up -d --build
echo.
echo Estado de los servicios:
echo - Frontend Web:       http://localhost
echo - PostgreSQL DB:      localhost:5432 (Base de datos: tetris_db, Usuario: postgres)
echo - Backend FastAPI:    http://localhost:8000/docs
echo.
pause
