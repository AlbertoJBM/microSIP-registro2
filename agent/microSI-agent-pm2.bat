::[Bat To Exe Converter]
::
::YAwzoRdxOk+EWAnk
::fBw5plQjdCyDJGyX8VAjFAFRXgWWAES0A5EO4f7+086IoVgQUewrd5zn6qaBKuUH5QXWcJEkxW5Il4sPDRdUQh+ibR07mkdy+3aAMM6Ppx3udkyI9UMyFGRmg1/AmSk3adBUk84E7ym980P6o6EZwnvqTLoBVS6h4qN4MchO9Am7CA==
::YAwzuBVtJxjWCl3EqQJgSA==
::ZR4luwNxJguZRRnk
::Yhs/ulQjdF+5
::cxAkpRVqdFKZSzk=
::cBs/ulQjdF+5
::ZR41oxFsdFKZSDk=
::eBoioBt6dFKZSDk=
::cRo6pxp7LAbNWATEpCI=
::egkzugNsPRvcWATEpCI=
::dAsiuh18IRvcCxnZtBJQ
::cRYluBh/LU+EWAnk
::YxY4rhs+aU+JeA==
::cxY6rQJ7JhzQF1fEqQJQ
::ZQ05rAF9IBncCkqN+0xwdVs0
::ZQ05rAF9IAHYFVzEqQJQ
::eg0/rx1wNQPfEVWB+kM9LVsJDGQ=
::fBEirQZwNQPfEVWB+kM9LVsJDGQ=
::cRolqwZ3JBvQF1fEqQJQ
::dhA7uBVwLU+EWDk=
::YQ03rBFzNR3SWATElA==
::dhAmsQZ3MwfNWATElA==
::ZQ0/vhVqMQ3MEVWAtB9wSA==
::Zg8zqx1/OA3MEVWAtB9wSA==
::dhA7pRFwIByZRRnk
::Zh4grVQjdCyDJGyX8VAjFAFRXgWWAES0A5EO4f7+086IoVgQUewrd5zn6qaBKuUH5QXWcJEkxW5Il4sPDRdUQh+ibR07mkdy+3aAMM6Ppx3udkmO40UkJ2Rzgm3EiWY2adB6lfAq42675Eif
::YB416Ek+ZG8=
::
::
::978f952a14a936cc963da21a135fa983
@echo off
title Instalador y ejecutor de agente-microSIP

REM Verifica si pm2 está instalado
where pm2 >nul 2>nul
IF %ERRORLEVEL% NEQ 0 (
    echo Instalando pm2 globalmente...
    npm install -g pm2
) ELSE (
    echo pm2 ya está instalado.
)

REM Inicia la aplicación con pm2
echo Iniciando agente-microSIP...
pm2 start dist/index.js --name "agente-microSIP"

REM Configura pm2 para arrancar con Windows
echo Configurando pm2 para iniciar con Windows...
pm2 startup

REM Guarda la lista de procesos activos
pm2 save

echo ============================================
echo El agente-microSIP ha sido configurado.
echo Se reiniciará automáticamente con Windows.
echo ============================================

pause
