# EchoSub API integration test script (end-to-end)
# Flow: boot backend -> register/login -> scan -> media list -> subtitle -> record -> progress -> cleanup
# Usage: .\scripts\test-api.ps1

$ErrorActionPreference = "Stop"

$RepoRoot = Resolve-Path "$PSScriptRoot\.."
$BackendDir = Join-Path $RepoRoot "backend"
$TestMedia = Join-Path $RepoRoot "test-media"
$TestDb = Join-Path $BackendDir "data\test-api.db"

# Refresh PATH so go.exe is discoverable in this session
$env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")
$env:GOPROXY = "https://goproxy.cn,direct"

# Test config
$env:ECHOSUB_PORT = "18080"
$env:ECHOSUB_DB_PATH = $TestDb
$env:ECHOSUB_MEDIA_DIR = $TestMedia
$env:ECHOSUB_JWT_SECRET = "integration-test-secret"
$env:GIN_MODE = "release"

$BaseUrl = "http://localhost:18080/api/v1"
$script:Pass = 0
$script:Fail = 0
$script:BackendJob = $null

function Step($name) {
    Write-Host ""
    Write-Host "=== $name ===" -ForegroundColor Cyan
}

function Ok($msg) {
    Write-Host "  [PASS] $msg" -ForegroundColor Green
    $script:Pass++
}

function Bad($msg) {
    Write-Host "  [FAIL] $msg" -ForegroundColor Red
    $script:Fail++
}

function Cleanup {
    Write-Host ""
    Write-Host "=== Cleanup ===" -ForegroundColor Cyan
    if ($script:BackendJob -and $script:BackendJob.State -eq "Running") {
        Stop-Job -Job $script:BackendJob -ErrorAction SilentlyContinue
        Start-Sleep -Milliseconds 500
    }
    if ($script:BackendJob) {
        Remove-Job -Job $script:BackendJob -Force -ErrorAction SilentlyContinue
    }
    # Kill any process still listening on 18080
    Get-NetTCPConnection -LocalPort 18080 -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess -Unique |
        ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
    foreach ($ext in @("", "-shm", "-wal")) {
        $f = "$TestDb$ext"
        if (Test-Path $f) { Remove-Item $f -Force -ErrorAction SilentlyContinue }
    }
    Write-Host "  cleanup done"
}

trap {
    Write-Host ""
    Write-Host "Script error: $_" -ForegroundColor Red
    Cleanup
    exit 1
}

# ---------- Boot backend ----------
Step "Boot backend on port 18080"
if (Test-Path $TestDb) { Remove-Item $TestDb -Force }
$script:BackendJob = Start-Job -ScriptBlock {
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
if ($ready) {
    Ok "backend ready"
} else {
    Bad "backend not ready within 20s"
    Cleanup
    exit 1
}

# ---------- 1. Register ----------
Step "1. Register user"
$Token = $null
try {
    $body = @{ username = "testuser"; password = "test123456" } | ConvertTo-Json
    $r = Invoke-RestMethod -Uri "$BaseUrl/auth/register" -Method POST -Body $body -ContentType "application/json" -TimeoutSec 5
    if ($r.code -eq 0 -and $r.data.token) {
        $Token = $r.data.token
        Ok "register ok, got JWT (len $($Token.Length))"
    } else {
        Bad "register response unexpected"
    }
} catch {
    # user may already exist on re-run, fall back to login
    try {
        $body = @{ username = "testuser"; password = "test123456" } | ConvertTo-Json
        $r = Invoke-RestMethod -Uri "$BaseUrl/auth/login" -Method POST -Body $body -ContentType "application/json" -TimeoutSec 5
        $Token = $r.data.token
        Ok "user existed, logged in instead, got JWT"
    } catch {
        Bad "register failed: $_"
    }
}
if (-not $Token) { Cleanup; exit 1 }

$Headers = @{ Authorization = "Bearer $Token" }

# ---------- 2. Login ----------
Step "2. Login"
try {
    $body = @{ username = "testuser"; password = "test123456" } | ConvertTo-Json
    $r = Invoke-RestMethod -Uri "$BaseUrl/auth/login" -Method POST -Body $body -ContentType "application/json" -TimeoutSec 5
    if ($r.code -eq 0 -and $r.data.token) {
        $Token = $r.data.token
        $Headers = @{ Authorization = "Bearer $Token" }
        Ok "login ok, token refreshed"
    } else {
        Bad "login response unexpected"
    }
} catch {
    Bad "login failed: $_"
}

# ---------- 3. Trigger scan ----------
Step "3. Trigger media scan"
try {
    $r = Invoke-RestMethod -Uri "$BaseUrl/scan/trigger" -Method POST -Headers $Headers -TimeoutSec 30
    Ok "scan triggered: $($r | ConvertTo-Json -Compress)"
} catch {
    Bad "scan trigger failed: $_"
}

# ---------- 4. Media list ----------
Step "4. Media list"
try {
    $uri = "$BaseUrl/media" + "?page=1&size=100"
    $r = Invoke-RestMethod -Uri $uri -Method GET -Headers $Headers -TimeoutSec 5
    $total = $r.data.total
    Ok "total media files: $total"
    $r.data.list | Select-Object -First 5 | ForEach-Object {
        $m = $_.media
        $sub = if ($m.subtitle_path) { "subtitle=yes" } else { "subtitle=no" }
        Write-Host "    - [ID=$($m.id)] $($m.name) | $($m.type) | album=$($m.album) | $sub" -ForegroundColor DarkGray
    }
} catch {
    Bad "media list failed: $_"
}

# ---------- 5. Albums ----------
Step "5. Album list"
try {
    $r = Invoke-RestMethod -Uri "$BaseUrl/albums" -Method GET -Headers $Headers -TimeoutSec 5
    Ok "album count: $($r.data.albums.Count)"
    $r.data.albums | ForEach-Object {
        Write-Host "    - $($_.album): $($_.count) file(s)" -ForegroundColor DarkGray
    }
} catch {
    Bad "album list failed: $_"
}

# ---------- 6. Subtitle parse (BOM regression) ----------
Step "6. Subtitle parse (expect 3 sentences for lesson1.srt after BOM fix)"
$SubMediaId = $null
try {
    $uri = "$BaseUrl/media" + "?page=1&size=100"
    $r = Invoke-RestMethod -Uri $uri -Method GET -Headers $Headers -TimeoutSec 5
    $lesson = $r.data.list | Where-Object { $_.media.name -like "lesson1*" } | Select-Object -First 1
    if ($lesson) {
        $SubMediaId = $lesson.media.id
        $s = Invoke-RestMethod -Uri "$BaseUrl/media/$SubMediaId/subtitle" -Method GET -Headers $Headers -TimeoutSec 5
        $cnt = $s.data.sentences.Count
        if ($cnt -eq 3) {
            Ok "lesson1.srt parsed into $cnt sentences (BOM fix verified)"
        } else {
            Bad "lesson1.srt parsed into $cnt sentences, expected 3"
        }
        $s.data.sentences | ForEach-Object {
            Write-Host "    - [$($_.index)] $($_.start)s -> $($_.end)s : $($_.text)" -ForegroundColor DarkGray
        }
    } else {
        Bad "lesson1 media not found"
    }
} catch {
    Bad "subtitle parse failed: $_"
}

# ---------- 7. Update play record ----------
Step "7. Update play record"
if ($SubMediaId) {
    try {
        $body = @{ last_position = 5.5; increment_play = $true } | ConvertTo-Json
        $r = Invoke-RestMethod -Uri "$BaseUrl/records/$SubMediaId" -Method PUT -Body $body -Headers $Headers -ContentType "application/json" -TimeoutSec 5
        Ok "play record updated: play_count=$($r.data.play_count), last_position=$($r.data.last_position)"
    } catch {
        Bad "update play record failed: $_"
    }
} else {
    Bad "skipped (no target media)"
}

# ---------- 8. Mark sentence completed ----------
Step "8. Mark sentence 0 completed (repeat_count=3)"
if ($SubMediaId) {
    try {
        $body = @{ completed = $true; repeat_count = 3 } | ConvertTo-Json
        $r = Invoke-RestMethod -Uri "$BaseUrl/records/$SubMediaId/sentences/0" -Method PUT -Body $body -Headers $Headers -ContentType "application/json" -TimeoutSec 5
        Ok "sentence progress updated: completed=$($r.data.completed), repeat_count=$($r.data.repeat_count)"
    } catch {
        Bad "mark sentence failed: $_"
    }
} else {
    Bad "skipped (no target media)"
}

# ---------- 9. Progress summary ----------
Step "9. Progress summary"
try {
    $r = Invoke-RestMethod -Uri "$BaseUrl/progress" -Method GET -Headers $Headers -TimeoutSec 5
    Ok "completed_sentences=$($r.data.completed_sentences)"
    $r.data.albums | ForEach-Object {
        Write-Host "    - album [$($_.album)]: total=$($_.total), played=$($_.played), total_played=$($_.total_played)" -ForegroundColor DarkGray
    }
} catch {
    Bad "progress summary failed: $_"
}

# ---------- 10. Settings ----------
Step "10. User settings read/write"
try {
    $body = @{ sentence_repeat = 5; pause_seconds = 2.0; loop_count = 3 } | ConvertTo-Json
    $r = Invoke-RestMethod -Uri "$BaseUrl/settings" -Method PUT -Body $body -Headers $Headers -ContentType "application/json" -TimeoutSec 5
    Ok "settings saved: sentence_repeat=$($r.data.sentence_repeat), pause_seconds=$($r.data.pause_seconds), loop_count=$($r.data.loop_count)"
} catch {
    Bad "settings save failed: $_"
}

# ---------- Summary ----------
Write-Host ""
Write-Host "=========================" -ForegroundColor Yellow
Write-Host "  PASS: $script:Pass" -ForegroundColor Green
Write-Host "  FAIL: $script:Fail" -ForegroundColor $(if ($script:Fail -gt 0) { "Red" } else { "Gray" })
Write-Host "=========================" -ForegroundColor Yellow

Cleanup

if ($script:Fail -gt 0) { exit 1 } else { exit 0 }
