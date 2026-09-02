@echo off
SETLOCAL EnableExtensions EnableDelayedExpansion
title Instalador completo: Node.js, npm y pm2

set LOG=%~dp0install-complete.log
set NODE_VERSION=20.11.0
set NODE_MSI=node-v%NODE_VERSION%-x64.msi
set NODE_URL=https://nodejs.org/dist/v%NODE_VERSION%/%NODE_MSI%

echo Iniciando instalacion completa %DATE% %TIME% > "%LOG%"

:: Verificar permisos de administrador
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Por favor ejecute este script COMO Administrador.
    echo [ERROR] Falta permisos de administrador. >> "%LOG%"
    pause
    exit /b 1
)

:: Verificar si Node.js está instalado
echo Verificando Node.js...
where node >nul 2>&1
if %errorlevel% equ 0 (
    echo Node.js ya está instalado. Versión actual:
    node -v
    echo Node.js ya instalado: >> "%LOG%"
    node -v >> "%LOG%" 2>&1
) else (
    echo Node.js no encontrado. Iniciando instalación...
    echo [INFO] Node.js no encontrado. Descargando e instalando... >> "%LOG%"
    
    :: Descargar Node.js
    echo Descargando Node.js v%NODE_VERSION% LTS...
    echo [INFO] Descargando desde: %NODE_URL% >> "%LOG%"
    
    powershell -Command "& {[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri '%NODE_URL%' -OutFile '%TEMP%\%NODE_MSI%'}" >> "%LOG%" 2>&1
    
    if not exist "%TEMP%\%NODE_MSI%" (
        echo [ERROR] Error al descargar Node.js
        echo [ERROR] Error al descargar Node.js >> "%LOG%"
        pause
        exit /b 1
    )
    
    :: Instalar Node.js silenciosamente
    echo Instalando Node.js...
    echo [INFO] Ejecutando instalador MSI... >> "%LOG%"
    msiexec /i "%TEMP%\%NODE_MSI%" /qn /norestart >> "%LOG%" 2>&1
    
    if %errorlevel% neq 0 (
        echo [ERROR] Error durante la instalación de Node.js
        echo [ERROR] Error MSI code: %errorlevel% >> "%LOG%"
        pause
        exit /b 1
    )
    
    :: Actualizar PATH
    set "PATH=%ProgramFiles%\nodejs;%PATH%"
    
    echo Node.js instalado correctamente.
    echo [INFO] Node.js instalado correctamente >> "%LOG%"
    
    :: Limpiar instalador
    del "%TEMP%\%NODE_MSI%" >nul 2>&1
)

:: Verificar npm
echo Verificando npm...
where npm >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] npm no encontrado después de la instalación
    echo [ERROR] npm no encontrado >> "%LOG%"
    pause
    exit /b 1
)

:: Mostrar versiones
echo.
echo ========================================
echo Versiones instaladas:
echo ========================================
echo Node.js: 
node -v
echo npm: 
npm -v
echo ========================================
echo.

echo Node version: >> "%LOG%"
node -v >> "%LOG%" 2>&1
echo npm version: >> "%LOG%"
npm -v >> "%LOG%" 2>&1

:: Instalar pm2 globalmente
echo Verificando pm2...
where pm2 >nul 2>&1
if %errorlevel% neq 0 (
    echo Instalando pm2 globalmente...
    echo [INFO] Instalando pm2 globalmente >> "%LOG%"
    npm install -g pm2 >> "%LOG%" 2>&1
    
    if %errorlevel% neq 0 (
        echo [ERROR] Error al instalar pm2
        echo [ERROR] Error instalando pm2 >> "%LOG%"
        pause
        exit /b 1
    )
    echo pm2 instalado correctamente.
) else (
    echo pm2 ya está instalado.
)

:: Verificar instalación de pm2
where pm2 >nul 2>&1
if %errorlevel% neq 0 (
    echo [ADVERTENCIA] pm2 no se encuentra en PATH
    echo [ADVERTENCIA] pm2 no encontrado en PATH >> "%LOG%"
    
    :: Intentar localizar pm2
    if exist "%APPDATA%\npm\pm2.cmd" (
        set "PATH=%APPDATA%\npm;%PATH%"
        echo [INFO] pm2 encontrado en %APPDATA%\npm >> "%LOG%"
    ) else (
        echo [ERROR] No se pudo localizar pm2
        echo [ERROR] pm2 no localizado >> "%LOG%"
        pause
        exit /b 1
    )
)

:: Instalar dependencias del proyecto
if exist package.json (
    echo.
    echo Instalando dependencias del proyecto...
    echo [INFO] Ejecutando npm install >> "%LOG%"
    npm install --no-audit --no-fund >> "%LOG%" 2>&1
    
    if %errorlevel% neq 0 (
        echo [ERROR] Error instalando dependencias
        echo [ERROR] Error en npm install >> "%LOG%"
        pause
        exit /b 1
    )
    
    echo Ejecutando build...
    echo [INFO] Ejecutando npm run build >> "%LOG%"
    npm run build --silent >> "%LOG%" 2>&1
    
    if %errorlevel% neq 0 (
        echo [ERROR] Error durante el build
        echo [ERROR] Error en npm run build >> "%LOG%"
        pause
        exit /b 1
    )
) else (
    echo [ADVERTENCIA] package.json no encontrado, saltando npm install/build
    echo [ADVERTENCIA] package.json no encontrado >> "%LOG%"
)

:: Iniciar aplicación con pm2
echo.
echo Iniciando aplicación con pm2...
echo [INFO] Iniciando con pm2 >> "%LOG%"

:: Verificar si ya existe el proceso
pm2 describe "agenteMicroSIP" >nul 2>&1
if %errorlevel% equ 0 (
    echo [INFO] El proceso ya existe. Reiniciando...
    pm2 restart "agenteMicroSIP" >> "%LOG%" 2>&1
) else (
    if exist "dist\index.js" (
        pm2 start dist/index.js --name "agenteMicroSIP" >> "%LOG%" 2>&1
    ) elseif exist "index.js" (
        pm2 start index.js --name "agenteMicroSIP" >> "%LOG%" 2>&1
    ) else (
        echo [ERROR] No se encontró dist\index.js ni index.js
        echo [ERROR] Archivo de entrada no encontrado >> "%LOG%"
        pause
        exit /b 1
    )
)

:: Configurar pm2 para inicio automático
echo.
echo Configurando pm2 para inicio automático...
echo [INFO] Configurando pm2 startup >> "%LOG%"
pm2 save >> "%LOG%" 2>&1
pm2 startup >> "%LOG%" 2>&1

:: Mostrar estado final
echo.
echo ========================================
echo Estado de pm2:
echo ========================================
pm2 list

echo.
echo ========================================
echo Resumen de instalación:
echo ========================================
echo Node.js: OK
echo npm: OK
echo pm2: OK
echo Aplicación: Configurada
echo.
echo Log completo disponible en: %LOG%
echo ========================================

echo.
echo Instalación completada exitosamente.
type "%LOG%" | findstr /i "error" >nul
if %errorlevel% equ 0 (
    echo [ADVERTENCIA] Se encontraron errores en el log
) else (
    echo [OK] Sin errores detectados
)

pause
endlocal