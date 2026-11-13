$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

# O SQLite moderno é puro Go; CGO desativado gera um binário independente no Windows 11.
$previousGOOS = $env:GOOS
$previousGOARCH = $env:GOARCH
$previousCGO = $env:CGO_ENABLED
try {
  $env:GOOS = 'windows'
  $env:GOARCH = 'amd64'
  $env:CGO_ENABLED = '0'
  go build -trimpath -ldflags='-s -w' -o serverMicroSIP.exe .
  Write-Host "Servidor compilado: $PSScriptRoot\serverMicroSIP.exe"
  Write-Host 'Mantenha a pasta data ao lado do executável.'
} finally {
  $env:GOOS = $previousGOOS
  $env:GOARCH = $previousGOARCH
  $env:CGO_ENABLED = $previousCGO
}