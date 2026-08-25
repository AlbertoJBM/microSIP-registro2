# reset-db.ps1
# Script para limpiar la base de datos SQLite del servidor

param(
    [string]$dbPath = "database.db",
    [switch]$verificar
)

# Ruta de la base de datos
$databasePath = Join-Path (Get-Location) $dbPath

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "🗄️  Limpieza de base de datos SQLite" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Verificar que el archivo existe
if (-not (Test-Path $databasePath)) {
    Write-Host "❌ Error: No se encontró la base de datos en: $databasePath" -ForegroundColor Red
    exit 1
}

Write-Host "📁 Base de datos: $databasePath" -ForegroundColor Green

# Contar registros antes de eliminar
Write-Host ""
Write-Host "📊 Contando registros actuales..." -ForegroundColor Yellow
try {
    $countBefore = & sqlite3 $databasePath "SELECT COUNT(*) FROM call_logs;"
    Write-Host "   Registros actuales: $countBefore" -ForegroundColor Gray
} catch {
    Write-Host "❌ Error al contar registros. ¿Tienes sqlite3 instalado?" -ForegroundColor Red
    Write-Host ""
    Write-Host "💡 Instala sqlite3 con:" -ForegroundColor Yellow
    Write-Host "   winget install sqlite.sqlite" -ForegroundColor Cyan
    Write-Host "   o" -ForegroundColor Yellow
    Write-Host "   choco install sqlite" -ForegroundColor Cyan
    exit 1
}

# Confirmar eliminación
Write-Host ""
Write-Host "⚠️  ¿Estás seguro de que quieres eliminar TODOS los registros?" -ForegroundColor Yellow
$confirm = Read-Host "   Escribe 'SI' para confirmar (o cualquier otra tecla para cancelar)"

if ($confirm -ne "SI") {
    Write-Host ""
    Write-Host "❌ Operación cancelada por el usuario" -ForegroundColor Red
    exit 0
}

Write-Host ""
Write-Host "🗑️  Eliminando registros..." -ForegroundColor Yellow

try {
    # Eliminar todos los registros
    & sqlite3 $databasePath "DELETE FROM call_logs;"
    
    # Reiniciar auto-incremento
    & sqlite3 $databasePath "DELETE FROM sqlite_sequence WHERE name='call_logs';" 2>$null
    
    Write-Host "✅ Registros eliminados exitosamente" -ForegroundColor Green
} catch {
    Write-Host "❌ Error al eliminar registros: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Verificar resultado
if ($verificar) {
    Write-Host ""
    Write-Host "📊 Verificando resultado..." -ForegroundColor Yellow
    $countAfter = & sqlite3 $databasePath "SELECT COUNT(*) FROM call_logs;"
    Write-Host "   Registros después de limpiar: $countAfter" -ForegroundColor Gray
    
    if ($countAfter -eq 0) {
        Write-Host "   ✅ Base de datos limpia correctamente" -ForegroundColor Green
    } else {
        Write-Host "   ⚠️  Aún hay registros en la base de datos" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "✅ ¡Operación completada!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "💡 Ahora puedes reiniciar los agentes para que sincronicen desde cero" -ForegroundColor Yellow
Write-Host ""