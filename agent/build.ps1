$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
$env:CGO_ENABLED = '0'
go build -ldflags='-s -w' -o MicroSIP-Agent.exe .
Write-Host "Listo: $PSScriptRoot\MicroSIP-Agent.exe"
Write-Host "Copia ese exe junto con agent.json a cada maquina."
