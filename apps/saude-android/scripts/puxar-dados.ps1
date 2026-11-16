# Puxa os dados coletados no relógio (sessões, ECG, capacidades) para apps/saude-android/dados/
# Uso: powershell -File scripts\puxar-dados.ps1 [-Serial 192.168.x.x:porta]
param([string]$Serial = "")

$ErrorActionPreference = "Stop"
$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
$pkg = "app.nossotudo.saude.wear"
$raiz = Split-Path $PSScriptRoot -Parent
$destino = Join-Path $raiz "dados"
New-Item -ItemType Directory -Force $destino | Out-Null

$sel = if ($Serial) { "-s $Serial" } else { "" }
$tar = Join-Path $destino "relogio.tar"

# exec-out em binário: precisa passar pelo cmd (o PowerShell 5.1 corrompe binário em redirecionamento)
cmd /c "`"$adb`" $sel exec-out run-as $pkg tar -cf - files > `"$tar`""
if ((Get-Item $tar).Length -lt 100) { throw "Nada recebido. O app está instalado (build debug) e o relógio conectado?" }

tar -xf $tar -C $destino
Remove-Item $tar
Write-Host "Dados em: $destino\files"
Get-ChildItem "$destino\files" -Recurse -File | Select-Object @{n = 'arquivo'; e = { $_.FullName.Replace("$destino\files\", '') } }, @{n = 'KB'; e = { [math]::Round($_.Length / 1KB, 1) } } | Format-Table -AutoSize
