@echo off
cd /d "%~dp0"
if not exist .env (
  echo Missing server\.env
  echo Copy .env.example to .env, paste your xAI API key, and run this file again.
  pause
  exit /b 1
)
npm start
pause
