# Verify Emby metadata detection: dump album meta + media description
$ErrorActionPreference = "Stop"

$BackendDir = "d:\Code\Go\EchoSub\backend"
$Db = Join-Path $BackendDir "data\verify.db"
if (Test-Path "$Db*") { Remove-Item "$Db*" -Force }

# Refresh PATH
$env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")
$env:GOPROXY = "https://goproxy.cn,direct"
$env:ECHOSUB_PORT = "18080"
$env:ECHOSUB_DB_PATH = "data\verify.db"
$env:ECHOSUB_MEDIA_DIR = "..\test-media"
$env:ECHOSUB_JWT_SECRET = "verify-secret"
$env:GIN_MODE = "release"

Set-Location $BackendDir
$BackendJob = Start-Job -ScriptBlock {
    param($d)
    Set-Location $d
    go run ./cmd/server 2>&1
} -ArgumentList $BackendDir

# Wait for /health
$ready = $false
for ($i = 0; $i -lt 40; $i++) {
    Start-Sleep -Milliseconds 500
    try {
        Invoke-RestMethod -Uri "http://localhost:18080/api/v1/health" -Method GET -TimeoutSec 2 | Out-Null
        $ready = $true
        break
    } catch { }
}
if (-not $ready) { Write-Error "backend not ready"; exit 1 }

# Register
$body = @{ username = "verifyuser"; password = "test123456" } | ConvertTo-Json
$r = Invoke-RestMethod -Uri "http://localhost:18080/api/v1/auth/register" -Method POST -Body $body -ContentType "application/json" -TimeoutSec 5
$Token = $r.data.token
$Headers = @{ Authorization = "Bearer $Token" }

# Trigger scan and wait for it to finish
$scan = Invoke-RestMethod -Uri "http://localhost:18080/api/v1/scan/trigger" -Method POST -Headers $Headers -TimeoutSec 60
Write-Host "Scan triggered: $($scan.message)"
Start-Sleep -Seconds 2
# Poll until scan finishes
for ($i = 0; $i -lt 30; $i++) {
    $status = Invoke-RestMethod -Uri "http://localhost:18080/api/v1/scan/status" -Method GET -Headers $Headers -TimeoutSec 5
    if (-not $status.data.scanning) { break }
    Start-Sleep -Seconds 1
}

# Get album list and dump
$albums = Invoke-RestMethod -Uri "http://localhost:18080/api/v1/albums" -Method GET -Headers $Headers -TimeoutSec 5
foreach ($a in $albums.data.albums) {
    Write-Host ""
    Write-Host "=== Album: $($a.album) ===" -ForegroundColor Cyan
    Write-Host "  cover_path: $($a.cover_path)"
    Write-Host "  banner_path: $($a.banner_path)"
    Write-Host "  description: $($a.description)"
    if ($a.sub_albums) {
        foreach ($s in $a.sub_albums) {
            Write-Host "  Season: $($s.sub_album)"
            Write-Host "    cover: $($s.cover_path)"
            Write-Host "    banner: $($s.banner_path)"
            Write-Host "    description: $($s.description)"
        }
    }
}

# Get media list for 小猪佩奇(2004) and dump description
$media = Invoke-RestMethod -Uri "http://localhost:18080/api/v1/media?album=%E5%B0%8F%E7%8C%AA%E4%BD%A9%E5%A5%87(2004)&size=5" -Method GET -Headers $Headers -TimeoutSec 5
Write-Host ""
Write-Host "=== 小猪佩奇(2004) Media (first 5) ===" -ForegroundColor Cyan
foreach ($m in $media.data.list) {
    Write-Host "  $($m.media.name)"
    Write-Host "    nfo_path: $($m.media.nfo_path)"
    Write-Host "    description: $($m.media.description)"
}

# Get single media detail
if ($media.data.list.Count -gt 0) {
    $firstId = $media.data.list[0].media.id
    $detail = Invoke-RestMethod -Uri "http://localhost:18080/api/v1/media/$firstId" -Method GET -Headers $Headers -TimeoutSec 5
    Write-Host ""
    Write-Host "=== Detail: $($detail.data.media.name) ===" -ForegroundColor Cyan
    Write-Host "  nfo_path: $($detail.data.media.nfo_path)"
    Write-Host "  description: $($detail.data.media.description)"
}

# Stop and cleanup
if ($BackendJob -and $BackendJob.State -eq "Running") {
    Stop-Job -Job $BackendJob -ErrorAction SilentlyContinue
    Remove-Job -Job $BackendJob -Force -ErrorAction SilentlyContinue
}
Get-NetTCPConnection -LocalPort 18080 -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique |
    ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
if (Test-Path "$Db*") { Remove-Item "$Db*" -Force }
