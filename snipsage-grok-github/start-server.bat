@echo off
cd /d "%~dp0server"
if not exist .env (
  echo Missing server\.env
  echo Copy server\.env.example to server\.env and add your xAI API key first.
  pause
  exit /b 1
)
npm start
pause
