@echo off
cd /d "%~dp0"
if not exist "serverMicroSIP.exe" (
	echo Execute build-windows.ps1 para compilar o servidor primeiro.
	exit /b 1
)
serverMicroSIP.exe