#!/usr/bin/env pwsh
# Download ECDICT dictionary (GPLv3) to backend/data/dict/ecdict.csv
#
# Source: https://github.com/skywind3000/ECDICT
# License: GPLv3
# Size: ~50MB (compressed) / ~77M entries
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File scripts/download-ecdict.ps1
#   # or specify path:
#   powershell -ExecutionPolicy Bypass -File scripts/download-ecdict.ps1 -Output "D:\path\to\ecdict.csv"
#
# Note: Script is kept pure-ASCII for Windows PowerShell 5.1 compatibility
# (PS 5.1 default GBK codepage cannot parse UTF-8 CJK comments and would
#  emit "Missing terminating quote" errors on byte 0xE4/0xE5 etc).

[CmdletBinding()]
param(
    [string]$Output = "backend\data\dict\ecdict.csv",
    [string]$Mirror = "https://github.com/skywind3000/ECDICT/releases/download/1.0.28/ecdict.csv"
)

$ErrorActionPreference = "Stop"

# Resolve target absolute path
$OutputAbs = if ([System.IO.Path]::IsPathRooted($Output)) {
    $Output
} else {
    Join-Path (Get-Location) $Output
}
$OutputDir = Split-Path -Parent $OutputAbs
if (-not (Test-Path $OutputDir)) {
    New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
}

Write-Host "[INFO] Downloading ECDICT dictionary..." -ForegroundColor Cyan
Write-Host "  Source: $Mirror"
Write-Host "  Target: $OutputAbs"

# Temp CSV file (ECDICT release is a single CSV; use CSV ext directly for clarity)
$TempCsv = Join-Path $env:TEMP "ecdict-download-$([Guid]::NewGuid().ToString('N')).csv"

try {
    $ProgressPreference = 'Continue'
    Invoke-WebRequest -Uri $Mirror -OutFile $TempCsv -UseBasicParsing
    $size = (Get-Item $TempCsv).Length
    Write-Host "[OK] Download complete: $TempCsv ($([math]::Round($size/1MB, 2)) MB)" -ForegroundColor Green
}
catch {
    Write-Host "[ERROR] Download failed: $_" -ForegroundColor Red
    Write-Host "[HINT] You may download manually and place it at $OutputAbs" -ForegroundColor Yellow
    Write-Host "[HINT] Or use a CN mirror: https://gh-proxy.com/$Mirror" -ForegroundColor Yellow
    if (Test-Path $TempCsv) { Remove-Item $TempCsv -Force }
    exit 1
}

# Move to target
Move-Item -Force $TempCsv $OutputAbs
Write-Host "[OK] Dictionary is in place: $OutputAbs" -ForegroundColor Green
Write-Host ""
Write-Host "[NEXT] Start the backend and it will auto-import. After import, see" -ForegroundColor Cyan
Write-Host "       'Settings -> Dictionary -> Builtin ECDICT' card. Or trigger" -ForegroundColor Cyan
Write-Host "       manually: POST /api/v1/dictionary/builtin/reload" -ForegroundColor Cyan
