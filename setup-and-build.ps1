# setup-and-build.ps1
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "  Instalando dependencias del proyecto..." -ForegroundColor Yellow
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host ""

# Función para instalar dependencias en un directorio
function Install-Dependencies {
    param($Folder)
    Write-Host "[$Folder] Instalando dependencias..." -ForegroundColor Green
    Set-Location $Folder
    
    # Instala dependencias principales
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Error instalando dependencias en $Folder" -ForegroundColor Red
        exit 1
    }
    
    # Instala @types/node para todos
    npm install --save-dev @types/node
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Error instalando @types/node en $Folder" -ForegroundColor Red
        exit 1
    }
    
    Set-Location ..
    Write-Host ""
}

# Instalar en raíz
Write-Host "[RAIZ] Instalando dependencias..." -ForegroundColor Green
npm install

# Instalar en cada subproyecto
$folders = @("server", "agent", "dashboard")
foreach ($folder in $folders) {
    Install-Dependencies $folder
}

# Instalaciones específicas para dashboard
Write-Host "[DASHBOARD] Instalando dependencias específicas..." -ForegroundColor Green
Set-Location dashboard
npm install react react-dom socket.io-client recharts
npm install --save-dev @types/react @types/react-dom @types/socket.io-client vite @vitejs/plugin-react
Set-Location ..

Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "  Todas las dependencias instaladas!" -ForegroundColor Green
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Construyendo el proyecto..." -ForegroundColor Yellow
npm run build-all

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "=============================================" -ForegroundColor Cyan
    Write-Host "  ¡Build completado exitosamente!" -ForegroundColor Green
    Write-Host "=============================================" -ForegroundColor Cyan
} else {
    Write-Host ""
    Write-Host "=============================================" -ForegroundColor Red
    Write-Host "  Error en el build!" -ForegroundColor Red
    Write-Host "=============================================" -ForegroundColor Red
}

Read-Host "Presiona Enter para salir..."