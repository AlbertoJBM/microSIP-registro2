# ============================================================================
# INSTALADOR AUTOMÁTICO - MicroSIP Queue Auto Lock/Unlock
# ============================================================================
# Este script configura todo automáticamente para salir/entrar de la fila
# cuando se bloquea/desbloquea Windows con Win + L
# ============================================================================

param(
    [string]$QueueNumber = "1",  # Número de la fila (cambiar si es necesario)
    [switch]$Uninstall       # Usar para desinstalar
)

# ============================================================================
# CONFIGURACIÓN
# ============================================================================
$scriptPath = "C:\Scripts\MicroSIP"
$logFile = "$scriptPath\log.txt"
$sairScript = "$scriptPath\sair-fila.ps1"
$entrarScript = "$scriptPath\entrar-fila.ps1"
$taskNameLock = "MicroSIP - Sair Fila (Bloqueio)"
$taskNameUnlock = "MicroSIP - Entrar Fila (Desbloqueio)"

# ============================================================================
# FUNCIONES
# ============================================================================

function Write-Header {
    param([string]$Text)
    Write-Host ""
    Write-Host "============================================================================" -ForegroundColor Cyan
    Write-Host "  $Text" -ForegroundColor White
    Write-Host "============================================================================" -ForegroundColor Cyan
    Write-Host ""
}

function Write-Success {
    param([string]$Text)
    Write-Host "✅ $Text" -ForegroundColor Green
}

function Write-Error-Custom {
    param([string]$Text)
    Write-Host "❌ $Text" -ForegroundColor Red
}

function Write-Warning-Custom {
    param([string]$Text)
    Write-Host "⚠️  $Text" -ForegroundColor Yellow
}

function Write-Info {
    param([string]$Text)
    Write-Host "ℹ️  $Text" -ForegroundColor Gray
}

# ============================================================================
# DESINSTALAR
# ============================================================================

if ($Uninstall) {
    Write-Header "DESINSTALANDO CONFIGURAÇÃO"
    
    # Eliminar tareas
    Write-Info "Eliminando tarefas agendadas..."
    try {
        Unregister-ScheduledTask -TaskName $taskNameLock -Confirm:$false -ErrorAction SilentlyContinue
        Write-Success "Tarefa de bloqueio removida"
    } catch {
        Write-Warning-Custom "Tarefa de bloqueio não encontrada"
    }
    
    try {
        Unregister-ScheduledTask -TaskName $taskNameUnlock -Confirm:$false -ErrorAction SilentlyContinue
        Write-Success "Tarefa de desbloqueio removida"
    } catch {
        Write-Warning-Custom "Tarefa de desbloqueio não encontrada"
    }
    
    # Eliminar scripts
    Write-Info "Eliminando scripts..."
    if (Test-Path $scriptPath) {
        Remove-Item -Path $scriptPath -Recurse -Force
        Write-Success "Pasta $scriptPath eliminada"
    }
    
    Write-Header "DESINSTALAÇÃO CONCLUÍDA"
    exit 0
}

# ============================================================================
# INSTALAR
# ============================================================================

Write-Header "INSTALANDO MICRO SIP QUEUE AUTO LOCK/UNLOCK"

# Verificar si es Administrador
if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Error-Custom "É necessário executar como Administrador!"
    Write-Info "Clique com o botão direito no PowerShell e selecione 'Executar como Administrador'"
    Write-Info "Ou execute: Start-Process powershell -Verb RunAs"
    exit 1
}
Write-Success "Executando como Administrador"

# ============================================================================
# 1. HABILITAR AUDITORÍA
# ============================================================================

Write-Info "Habilitando auditoria de eventos de bloqueio/desbloqueio..."
try {
    auditpol /set /subcategory:"Other Logon/Logoff Events" /success:enable /failure:disable | Out-Null
    Write-Success "Auditoria habilitada com sucesso"
} catch {
    Write-Warning-Custom "Não foi possível habilitar a auditoria. Pode não funcionar corretamente."
}

# ============================================================================
# 2. CREAR CARPETA DE SCRIPTS
# ============================================================================

Write-Info "Criando pasta de scripts..."
try {
    if (-not (Test-Path $scriptPath)) {
        New-Item -ItemType Directory -Path $scriptPath -Force | Out-Null
    }
    Write-Success "Pasta criada: $scriptPath"
} catch {
    Write-Error-Custom "Não foi possível criar a pasta: $_"
    exit 1
}

# ============================================================================
# 3. CREAR SCRIPT DE BLOQUEIO (sair-fila.ps1)
# ============================================================================

Write-Info "Criando script de bloqueio (sair da fila)..."

$sairContent = @"
# ============================================================================
# Script de Bloqueio - Sair da Fila
# Executado quando Windows é bloqueado (Win + L)
# ============================================================================

`$queueNumber = "$QueueNumber"
`$logFile = "$logFile"

try {
    # Log do evento
    `$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Add-Content -Path `$logFile -Value "[`$timestamp] 🔒 BLOQUEADO - Saindo da fila `$queueNumber"

    # Aguardar um momento para garantir que a janela do MicroSIP está ativa
    Start-Sleep -Milliseconds 1000

    # Simular teclas para *12 + número da fila + Enter
    Add-Type -AssemblyName System.Windows.Forms
    
    # Pequeno delay antes de enviar
    Start-Sleep -Milliseconds 500
    
    # Enviar *12
    [System.Windows.Forms.SendKeys]::SendWait("*12")
    Start-Sleep -Milliseconds 300
    
    # Enviar número da fila
    [System.Windows.Forms.SendKeys]::SendWait(`$queueNumber)
    Start-Sleep -Milliseconds 300
    
    # Enviar Enter
    [System.Windows.Forms.SendKeys]::SendWait("{ENTER}")

    # Log de sucesso
    `$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Add-Content -Path `$logFile -Value "[`$timestamp] ✅ Comando *12`$queueNumber enviado com sucesso"
    
} catch {
    # Log de erro
    `$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Add-Content -Path `$logFile -Value "[`$timestamp] ❌ ERRO: `$_"
}
"@

try {
    Set-Content -Path $sairScript -Value $sairContent -Encoding UTF8
    Write-Success "Script de bloqueio criado: $sairScript"
} catch {
    Write-Error-Custom "Não foi possível criar o script de bloqueio: $_"
    exit 1
}

# ============================================================================
# 4. CREAR SCRIPT DE DESBLOQUEO (entrar-fila.ps1)
# ============================================================================

Write-Info "Criando script de desbloqueio (entrar na fila)..."

$entrarContent = @"
# ============================================================================
# Script de Desbloqueio - Entrar na Fila
# Executado quando Windows é desbloqueado (Win + L)
# ============================================================================

`$queueNumber = "$QueueNumber"
`$logFile = "$logFile"

try {
    # Log do evento
    `$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Add-Content -Path `$logFile -Value "[`$timestamp] 🔓 DESBLOQUEADO - Entrando na fila `$queueNumber"

    # Aguardar um momento para garantir que a sessão está totalmente desbloqueada
    Start-Sleep -Milliseconds 1500

    # Simular teclas para *11 + número da fila + Enter
    Add-Type -AssemblyName System.Windows.Forms
    
    # Pequeno delay antes de enviar
    Start-Sleep -Milliseconds 500
    
    # Enviar *11
    [System.Windows.Forms.SendKeys]::SendWait("*11")
    Start-Sleep -Milliseconds 300
    
    # Enviar número da fila
    [System.Windows.Forms.SendKeys]::SendWait(`$queueNumber)
    Start-Sleep -Milliseconds 300
    
    # Enviar Enter
    [System.Windows.Forms.SendKeys]::SendWait("{ENTER}")

    # Log de sucesso
    `$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Add-Content -Path `$logFile -Value "[`$timestamp] ✅ Comando *11`$queueNumber enviado com sucesso"
    
} catch {
    # Log de erro
    `$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Add-Content -Path `$logFile -Value "[`$timestamp] ❌ ERRO: `$_"
}
"@

try {
    Set-Content -Path $entrarScript -Value $entrarContent -Encoding UTF8
    Write-Success "Script de desbloqueio criado: $entrarScript"
} catch {
    Write-Error-Custom "Não foi possível criar o script de desbloqueio: $_"
    exit 1
}

# ============================================================================
# 5. CREAR TAREA DE BLOQUEO (Event ID 4800)
# ============================================================================

Write-Info "Criando tarefa agendada para BLOQUEIO (Event 4800)..."

$xmlLock = @"
<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <Triggers>
    <EventTrigger>
      <Enabled>true</Enabled>
      <Subscription>&lt;QueryList&gt;&lt;Query Id="0" Path="Security"&gt;&lt;Select Path="Security"&gt;*[System[(EventID=4800)]]&lt;/Select&gt;&lt;/Query&gt;&lt;/QueryList&gt;</Subscription>
    </EventTrigger>
  </Triggers>
  <Principals>
    <Principal id="Author">
      <UserId>$env:USERNAME</UserId>
      <LogonType>Interactive</LogonType>
      <RunLevel>HighestAvailable</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <AllowStartIfOnBatteries>true</AllowStartIfOnBatteries>
    <DontStopIfGoingOnBatteries>true</DontStopIfGoingOnBatteries>
    <ExecutionTimeLimit>PT5M</ExecutionTimeLimit>
  </Settings>
  <Actions>
    <Exec>
      <Command>powershell.exe</Command>
      <Arguments>-WindowStyle Hidden -ExecutionPolicy Bypass -File "$sairScript"</Arguments>
    </Exec>
  </Actions>
</Task>
"@

try {
    # Eliminar tarea existente si hay
    Unregister-ScheduledTask -TaskName $taskNameLock -Confirm:$false -ErrorAction SilentlyContinue | Out-Null
    
    # Registrar nueva tarea
    Register-ScheduledTask -TaskName $taskNameLock -Xml $xmlLock -Force | Out-Null
    Write-Success "Tarefa de bloqueio criada: $taskNameLock"
} catch {
    Write-Error-Custom "Não foi possível criar a tarefa de bloqueio: $_"
    exit 1
}

# ============================================================================
# 6. CREAR TAREA DE DESBLOQUEO (Event ID 4801)
# ============================================================================

Write-Info "Criando tarefa agendada para DESBLOQUEIO (Event 4801)..."

$xmlUnlock = @"
<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <Triggers>
    <EventTrigger>
      <Enabled>true</Enabled>
      <Subscription>&lt;QueryList&gt;&lt;Query Id="0" Path="Security"&gt;&lt;Select Path="Security"&gt;*[System[(EventID=4801)]]&lt;/Select&gt;&lt;/Query&gt;&lt;/QueryList&gt;</Subscription>
    </EventTrigger>
  </Triggers>
  <Principals>
    <Principal id="Author">
      <UserId>$env:USERNAME</UserId>
      <LogonType>Interactive</LogonType>
      <RunLevel>HighestAvailable</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <AllowStartIfOnBatteries>true</AllowStartIfOnBatteries>
    <DontStopIfGoingOnBatteries>true</DontStopIfGoingOnBatteries>
    <ExecutionTimeLimit>PT5M</ExecutionTimeLimit>
  </Settings>
  <Actions>
    <Exec>
      <Command>powershell.exe</Command>
      <Arguments>-WindowStyle Hidden -ExecutionPolicy Bypass -File "$entrarScript"</Arguments>
    </Exec>
  </Actions>
</Task>
"@

try {
    # Eliminar tarea existente si hay
    Unregister-ScheduledTask -TaskName $taskNameUnlock -Confirm:$false -ErrorAction SilentlyContinue | Out-Null
    
    # Registrar nueva tarea
    Register-ScheduledTask -TaskName $taskNameUnlock -Xml $xmlUnlock -Force | Out-Null
    Write-Success "Tarefa de desbloqueio criada: $taskNameUnlock"
} catch {
    Write-Error-Custom "Não foi possível criar a tarefa de desbloqueio: $_"
    exit 1
}

# ============================================================================
# 7. CREAR SCRIPT DE LOG (opcional)
# ============================================================================

Write-Info "Criando arquivo de log inicial..."
try {
    $logContent = @"
============================================================================
LOG DE EVENTOS - MICRO SIP QUEUE AUTO LOCK/UNLOCK
============================================================================
Instalado em: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")
Usuário: $env:USERNAME
Número da fila: $QueueNumber
============================================================================

"@
    Set-Content -Path $logFile -Value $logContent -Encoding UTF8
    Write-Success "Arquivo de log criado: $logFile"
} catch {
    Write-Warning-Custom "Não foi possível criar o arquivo de log"
}

# ============================================================================
# 8. VERIFICAR INSTALACIÓN
# ============================================================================

Write-Header "VERIFICANDO INSTALAÇÃO"

Write-Info "Verificando tarefas agendadas..."
$tasks = Get-ScheduledTask -TaskName "MicroSIP*" -ErrorAction SilentlyContinue
if ($tasks) {
    foreach ($task in $tasks) {
        Write-Success "Tarefa encontrada: $($task.TaskName) (Estado: $($task.State))"
    }
} else {
    Write-Warning-Custom "Nenhuma tarefa encontrada!"
}

Write-Info ""
Write-Info "Arquivos criados:"
Write-Info "  - $sairScript"
Write-Info "  - $entrarScript"
Write-Info "  - $logFile"

# ============================================================================
# 9. INSTRUCCIONES FINALES
# ============================================================================

Write-Header "INSTALAÇÃO CONCLUÍDA COM SUCESSO!"

Write-Success "Configuração completa para fila número: $QueueNumber"
Write-Host ""
Write-Host "📋 PRÓXIMOS PASSOS:" -ForegroundColor Yellow
Write-Host ""
Write-Host "  1. Teste o funcionamento:" -ForegroundColor Cyan
Write-Host "     - Pressione Win + L para bloquear a sessão" -ForegroundColor Gray
Write-Host "     - Desbloqueie a sessão" -ForegroundColor Gray
Write-Host "     - Verifique o log: Get-Content $logFile -Tail 20" -ForegroundColor Gray
Write-Host ""
Write-Host "  2. Se não funcionar, verifique:" -ForegroundColor Cyan
Write-Host "     - O MicroSIP está aberto e em foco?" -ForegroundColor Gray
Write-Host "     - A auditoria está habilitada? (Get-WinEvent -LogName Security -FilterXPath '*[System[(EventID=4800 or EventID=4801)]]' -MaxEvents 5)" -ForegroundColor Gray
Write-Host ""
Write-Host "  3. Para desinstalar:" -ForegroundColor Cyan
Write-Host "     Execute: .\$($MyInvocation.MyCommand.Name) -Uninstall" -ForegroundColor Gray
Write-Host ""
Write-Host "============================================================================" -ForegroundColor Cyan
Write-Host ""

# Abrir el log para que el usuario pueda monitorear
Write-Info "Abrindo o log para monitoramento..."
Start-Process notepad.exe -ArgumentList $logFile

Write-Success "Instalação finalizada!"