@echo off
setlocal
cd /d "%~dp0"
if not exist ".env" (
  echo ERRO: crie o arquivo .env nesta pasta com SERVER_URL=http://IP_DO_SERVIDOR:3001
  pause
  exit /b 1
)
if not exist "dist\index.js" (
  echo ERRO: arquivos do agente nao encontrados.
  pause
  exit /b 1
)
node dist\index.js
pause
