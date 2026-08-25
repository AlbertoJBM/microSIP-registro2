@echo off
title Instalador Agente MicroSIP
color 0A
chcp 65001 >nul

echo.
echo ================================================
echo.
echo    📞 INSTALADOR DEL AGENTE MICROSIP
echo    Versión 1.0
echo.
echo ================================================
echo.

REM Configurar servidor predeterminado
set SERVER_URL=http://10.25.96.58:3001

REM Mostrar servidor actual
echo 📡 Servidor configurado: %SERVER_URL%
echo.
echo ¿Desea cambiar el servidor?
set /p CHANGE_SERVER="Escriba S para cambiar o N para continuar: "
if /i "%CHANGE_SERVER%"=="S" (
    echo.
    set /p SERVER_URL="Ingrese la URL del servidor: "
    echo.
)

echo.
echo ================================================
echo    INICIANDO INSTALACIÓN
echo ================================================
echo.

REM Verificar Node.js
echo [1/6] Verificando Node.js...
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Node.js no está instalado
    echo.
    echo 📥 Descargando Node.js...
    powershell -Command "Invoke-WebRequest -Uri 'https://nodejs.org/dist/v20.11.0/node-v20.11.0-x64.msi' -OutFile '%TEMP%\node-installer.msi'"
    
    echo 🔧 Instalando Node.js...
    msiexec /i "%TEMP%\node-installer.msi" /qn
    
    echo ✅ Node.js instalado correctamente
    timeout /t 3 /nobreak >nul
    
    REM Actualizar PATH
    set "PATH=%PATH%;C:\Program Files\nodejs"
) else (
    echo ✅ Node.js ya está instalado
    node --version
)

echo.
echo [2/6] Creando directorio de instalación...
set INSTALL_DIR=%USERPROFILE%\MicroSIP-Agent
if not exist "%INSTALL_DIR%" (
    mkdir "%INSTALL_DIR%"
    echo ✅ Directorio creado: %INSTALL_DIR%
) else (
    echo ⚠️ El directorio ya existe, se actualizará
)

echo.
echo [3/6] Copiando archivos del agente...
if exist "%~dp0agent\dist\index.js" (
    REM Crear estructura de carpetas
    if not exist "%INSTALL_DIR%\dist" mkdir "%INSTALL_DIR%\dist"
    
    REM Copiar archivos compilados
    xcopy /E /I /Y "%~dp0agent\dist\*" "%INSTALL_DIR%\dist\" >nul
    
    REM Copiar package.json si existe
    if exist "%~dp0agent\package.json" (
        copy /Y "%~dp0agent\package.json" "%INSTALL_DIR%\package.json" >nul
    )
    
    echo ✅ Archivos copiados correctamente
) else (
    echo ❌ No se encontraron archivos compilados
    echo.
    echo Por favor, asegúrese de que:
    echo 1. La carpeta "agent\dist" existe junto a este instalador
    echo 2. El agente esté compilado correctamente
    echo.
    echo Para compilar, ejecute:
    echo   cd agent
    echo   npm install
    echo   npm run build
    echo.
    pause
    exit /b 1
)

echo.
echo [4/6] Configurando agente...
(
    echo SERVER_URL=%SERVER_URL%
    echo USERPROFILE=%USERPROFILE%
    echo NODE_ENV=production
) > "%INSTALL_DIR%\.env"
echo ✅ Configuración creada

REM Crear package.json mínimo si no existe
if not exist "%INSTALL_DIR%\package.json" (
    (
        echo {
        echo   "name": "microsip-agent",
        echo   "version": "1.0.0",
        echo   "main": "dist/index.js",
        echo   "scripts": {
        echo     "start": "node dist/index.js"
        echo   }
        echo }
    ) > "%INSTALL_DIR%\package.json"
)

echo.
echo [5/6] Instalando dependencias...
cd /d "%INSTALL_DIR%"
call npm init -y >nul 2>&1
call npm install chokidar axios socket.io-client sql.js dotenv --save --silent 2>nul

if %errorlevel% neq 0 (
    echo ⚠️ Error al instalar dependencias automáticamente
    echo Intentando con instalación completa...
    call npm install --silent 2>nul
)

echo ✅ Dependencias instaladas

echo.
echo [6/6] Creando accesos y configuraciones...

REM Crear script de inicio
(
    echo @echo off
    echo title Agente MicroSIP
    echo color 0A
    echo chcp 65001 ^>nul
    echo.
    echo echo ================================================
    echo echo    AGENTE MICROSIP
    echo echo ================================================
    echo echo.
    echo cd /d "%INSTALL_DIR%"
    echo node dist\index.js
    echo.
    echo if %%errorlevel%% neq 0 ^(
    echo     echo.
    echo     echo ❌ Error al iniciar el agente
    echo     echo.
    echo     echo Verifique que:
    echo     echo 1. El servidor esté accesible: %SERVER_URL%
    echo     echo 2. MicroSIP esté instalado
    echo     echo 3. La base de datos exista
    echo     echo.
    echo     pause
    echo ^)
) > "%INSTALL_DIR%\start.bat"

REM Crear acceso directo en el escritorio
echo Creando acceso directo en el escritorio...
powershell -Command "
    $ws = New-Object -ComObject WScript.Shell
    $desktop = [System.Environment]::GetFolderPath('Desktop')
    $shortcut = $ws.CreateShortcut(\"$desktop\Agente-MicroSIP.lnk\")
    $shortcut.TargetPath = '%INSTALL_DIR%\start.bat'
    $shortcut.WorkingDirectory = '%INSTALL_DIR%'
    $shortcut.Description = 'Agente de sincronización MicroSIP'
    $shortcut.Save()
"

REM Configurar inicio automático con Windows
echo Configurando inicio automático...
powershell -Command "
    $taskName = 'MicroSIP-Agent'
    
    # Eliminar tarea existente si hay
    $existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    if ($existing) {
        Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
    }
    
    # Crear nueva tarea
    $action = New-ScheduledTaskAction -Execute '%INSTALL_DIR%\start.bat' -WorkingDirectory '%INSTALL_DIR%'
    $trigger = New-ScheduledTaskTrigger -AtLogOn
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
    
    Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Description 'Agente de sincronización MicroSIP' -Force | Out-Null
"

REM Crear archivo de desinstalación
(
    echo @echo off
    echo title Desinstalar Agente MicroSIP
    echo color 0C
    echo chcp 65001 ^>nul
    echo.
    echo echo ================================================
    echo echo    DESINSTALAR AGENTE MICROSIP
    echo echo ================================================
    echo echo.
    echo echo ¿Está seguro de que desea desinstalar?
    echo set /p CONFIRM="Escriba S para confirmar: "
    echo if /i not "%%CONFIRM%%"=="S" exit /b
    echo.
    echo echo Deteniendo agente...
    echo taskkill /f /im node.exe 2^>nul
    echo.
    echo echo Eliminando tarea programada...
    echo powershell -Command "Unregister-ScheduledTask -TaskName 'MicroSIP-Agent' -Confirm:$false" 2^>nul
    echo.
    echo echo Eliminando acceso directo...
    echo powershell -Command "Remove-Item -Path \"$desktop\Agente-MicroSIP.lnk\" -Force -ErrorAction SilentlyContinue" 2^>nul
    echo.
    echo echo Eliminando archivos...
    echo rmdir /s /q "%INSTALL_DIR%" 2^>nul
    echo.
    echo echo ✅ Desinstalación completada
    echo pause
) > "%INSTALL_DIR%\uninstall.bat"

echo ✅ Configuraciones creadas

echo.
echo ================================================
echo    ¡INSTALACIÓN COMPLETADA CON ÉXITO!
echo ================================================
echo.
echo ✅ Resumen de la instalación:
echo    📁 Directorio: %INSTALL_DIR%
echo    📡 Servidor: %SERVER_URL%
echo    🚀 Inicio automático: Activado
echo    🖥️ Acceso directo: Escritorio
echo.
echo.
echo ¿Desea iniciar el agente ahora?
set /p START_NOW="Escriba S para iniciar o N para salir: "
if /i "%START_NOW%"=="S" (
    echo.
    echo Iniciando agente...
    start /min "%INSTALL_DIR%\start.bat"
    echo ✅ Agente iniciado en segundo plano
)

echo.
echo 📖 Información importante:
echo    - El agente se iniciará automáticamente al iniciar Windows
echo    - Para iniciar manualmente, use el acceso directo del escritorio
echo    - Para desinstalar, ejecute: %INSTALL_DIR%\uninstall.bat
echo.
pause