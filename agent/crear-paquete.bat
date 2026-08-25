@echo off
title Crear Paquete de Distribución
color 0B
chcp 65001 >nul

echo.
echo ================================================
echo    CREAR PAQUETE DE DISTRIBUCIÓN
echo ================================================
echo.

REM Limpiar distribución anterior
set DIST_DIR=distribucion
if exist "%DIST_DIR%" (
    echo Eliminando paquete anterior...
    rmdir /s /q "%DIST_DIR%"
)

echo [1/5] Compilando agente...
cd agent
call npm run build >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Error al compilar el agente
    cd ..
    pause
    exit /b 1
)
cd ..
echo ✅ Agente compilado

echo [2/5] Creando estructura de distribución...
mkdir "%DIST_DIR%"
mkdir "%DIST_DIR%\agent"
mkdir "%DIST_DIR%\agent\dist"
echo ✅ Estructura creada

echo [3/5] Copiando archivos...
xcopy /E /I /Y "agent\dist\*" "%DIST_DIR%\agent\dist\" >nul
copy "agent\package.json" "%DIST_DIR%\agent\" >nul
copy "agent\.env.example" "%DIST_DIR%\agent\" >nul 2>nul
copy "instalar.bat" "%DIST_DIR%\" >nul
echo ✅ Archivos copiados

echo [4/5] Creando documentación...
(
    echo ================================================
    echo    AGENTE MICROSIP - MANUAL DE INSTALACIÓN
    echo ================================================
    echo.
    echo INSTALACIÓN RÁPIDA:
    echo 1. Descomprima este paquete en cualquier carpeta
    echo 2. Ejecute el archivo "instalar.bat" con doble clic
    echo 3. Siga las instrucciones en pantalla
    echo 4. ¡Listo! El agente se instalará automáticamente
    echo.
    echo REQUISITOS:
    echo - Windows 10 o superior
    echo - MicroSIP instalado y configurado
    echo - Conexión de red al servidor
    echo.
    echo NOTA:
    echo - Node.js se instalará automáticamente si no existe
    echo - El agente se iniciará automáticamente con Windows
    echo.
    echo SOLUCIÓN DE PROBLEMAS:
    echo 1. Si el agente no inicia, verifique la conexión al servidor
    echo 2. Asegúrese de que MicroSIP esté instalado
    echo 3. Verifique que la base de datos de llamadas exista en:
    echo    %%USERPROFILE%%\AppData\Roaming\MicroSIP\call_log.db
    echo.
    echo SOPORTE:
    echo Contacte al administrador del sistema
    echo ================================================
) > "%DIST_DIR%\LEIA-ME.txt"
echo ✅ Documentación creada

echo [5/5] Creando archivo ZIP...
powershell -Command "Compress-Archive -Path '%DIST_DIR%\*' -DestinationPath 'Agente-MicroSIP.zip' -Force"
echo ✅ Paquete ZIP creado

echo.
echo ================================================
echo    ¡PAQUETE CREADO CON ÉXITO!
echo ================================================
echo.
echo 📦 Archivo: Agente-MicroSIP.zip
echo 📁 Carpeta: %DIST_DIR%\
echo.
echo Este archivo puedes enviarlo a tus compañeros.
echo.
echo Contenido del paquete:
dir /s /b "%DIST_DIR%"
echo.
pause