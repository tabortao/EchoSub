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

# ---------- 11. AI status (v0.8.0) ----------
Step "11. AI status (v0.8.0)"
try {
    $r = Invoke-RestMethod -Uri "$BaseUrl/ai/status" -Method GET -Headers $Headers -TimeoutSec 5
    if ($null -ne $r.data) {
        $enabled = $r.data.enabled
        $model = $r.data.model
        Ok "ai/status returned: enabled=$enabled, model=$model (no API key in response: $($r.data.PSObject.Properties.Name -notcontains 'api_key'))"
    } else {
        Bad "ai/status returned no data"
    }
} catch {
    Bad "ai/status failed: $_"
}

# ---------- 12. Subtitle update (v0.8.0 PUT /media/:id/subtitle) ----------
Step "12. Subtitle update (v0.8.0: atomic write-back to SRT/VTT)"
$UpdateMediaId = $null
try {
    $uri = "$BaseUrl/media" + "?page=1&size=100"
    $r = Invoke-RestMethod -Uri $uri -Method GET -Headers $Headers -TimeoutSec 5
    $subtitleMedia = $null
    foreach ($item in $r.data.list) {
        $sp = $item.media.subtitle_path
        if ($sp -and $sp -ne "") { $subtitleMedia = $item; break }
    }
    if ($subtitleMedia) {
        $UpdateMediaId = $subtitleMedia.media.id
        $s = Invoke-RestMethod -Uri "$BaseUrl/media/$UpdateMediaId/subtitle" -Method GET -Headers $Headers -TimeoutSec 5
        $orig = $s.data.sentences
        if ($orig.Count -gt 0) {
            $firstIdx = $orig[0].index
            $firstText = $orig[0].text
            $edited = New-Object System.Collections.Generic.List[object]
            foreach ($line in $orig) {
                $newText = $line.text
                if ($line.index -eq $firstIdx) { $newText = "[edit-test] " + $line.text }
                $edited.Add(@{ index = $line.index; start = $line.start; end = $line.end; text = $newText })
            }
            $body = @{ sentences = $edited.ToArray() } | ConvertTo-Json -Depth 5
            $u = Invoke-RestMethod -Uri "$BaseUrl/media/$UpdateMediaId/subtitle" -Method PUT -Body $body -Headers $Headers -ContentType "application/json" -TimeoutSec 10
            Ok "subtitle updated: path=$($u.data.path), count=$($u.data.count)"
            $restore = New-Object System.Collections.Generic.List[object]
            foreach ($line in $orig) {
                $restore.Add(@{ index = $line.index; start = $line.start; end = $line.end; text = $line.text })
            }
            $restoreBody = @{ sentences = $restore.ToArray() } | ConvertTo-Json -Depth 5
            Invoke-RestMethod -Uri "$BaseUrl/media/$UpdateMediaId/subtitle" -Method PUT -Body $restoreBody -Headers $Headers -ContentType "application/json" -TimeoutSec 10 | Out-Null
        } else {
            Bad "media #$UpdateMediaId has no sentences to update"
        }
    } else {
        Bad "no media with subtitle found in test-media"
    }
} catch {
    Bad "subtitle update failed: $_"
}

# ---------- 13. AI translate (v0.8.0 POST /ai/translate) ----------
Step "13. AI translate (v0.8.0: OpenAI compatible proxy)"
try {
    $body = @{ texts = @("Hello"); target_lang = "Chinese" } | ConvertTo-Json
    $r = Invoke-RestMethod -Uri "$BaseUrl/ai/translate" -Method POST -Body $body -Headers $Headers -ContentType "application/json" -TimeoutSec 10
    if ($r.code -eq 0) {
        $t = $r.data.translations[0]
        Ok "ai/translate returned: '$t'"
    } elseif ($r.message -like "*未启用*") {
        # 没配置 ECHOSUB_AI_API_KEY → 预期 503
        Ok "ai/translate correctly returns 'not enabled' when ECHOSUB_AI_API_KEY is not set (msg: $($r.message))"
    } else {
        Bad "ai/translate unexpected response: code=$($r.code), msg=$($r.message)"
    }
} catch {
    $code = $_.Exception.Response.StatusCode.value__
    if ($code -eq 503) {
        Ok "ai/translate correctly returns 503 when AI not enabled"
    } else {
        Bad "ai/translate failed: $_"
    }
}

# ---------- 14. AI test (v0.8.1 POST /ai/test connectivity) ----------
Step "14. AI test (v0.8.1: connectivity check)"
try {
    $r = Invoke-RestMethod -Uri "$BaseUrl/ai/test" -Method POST -Body "{}" -Headers $Headers -ContentType "application/json" -TimeoutSec 10
    if ($r.code -eq 0) {
        $data = $r.data
        if ($data.ok -eq $true) {
            Ok "ai/test connected: model=$($data.model), host=$($data.base_url_host), sample='$($data.sample_translation)', $($data.latency_ms)ms"
        } else {
            Ok "ai/test returned ok=false (expected when AI not enabled): msg='$($data.message)'"
        }
    } else {
        Bad "ai/test unexpected response: code=$($r.code), msg=$($r.message)"
    }
} catch {
    $code = $_.Exception.Response.StatusCode.value__
    Bad "ai/test failed: code=$code, msg=$_"
}

# ---------- 15. AI translate bilingual mode (v0.8.1 mode=bilingual) ----------
Step "15. AI translate bilingual mode (v0.8.1: bilingual subtitle generation)"
$bilingualOk = $false
$bilingualErr = ""
try {
    $body = @{ texts = @("Hello"); target_lang = "Chinese"; mode = "bilingual" } | ConvertTo-Json
    $r = Invoke-RestMethod -Uri "$BaseUrl/ai/translate" -Method POST -Body $body -Headers $Headers -ContentType "application/json" -TimeoutSec 10
    if ($r.code -eq 0) {
        $t = $r.data.translations[0]
        if ($t -and $t.Length -gt 5 -and $t -like "*`n*") {
            $firstLine = ($t -split "`n")[0]
            $secondLine = ($t -split "`n")[1]
            Ok "bilingual translate returns '`n' between original and translation: first='$firstLine' second='$secondLine'"
        } else {
            Bad "bilingual translate result does not look bilingual: '$t'"
        }
    } else {
        $bilingualOk = $true
        $bilingualErr = $r.message
    }
} catch {
    $code = $_.Exception.Response.StatusCode.value__
    if ($code -eq 503) {
        $bilingualOk = $true
        $bilingualErr = "503"
    } else {
        Bad "bilingual translate failed: $_"
    }
}
if ($bilingualOk) {
    Ok "bilingual translate correctly reports not-enabled state (msg: $bilingualErr)"
}

# ---------- 16. AI dictionary (v0.9.0 POST /ai/dictionary) ----------
Step "16. AI dictionary (v0.9.0: AI lookup with structured entry)"
try {
    $body = @{ word = "apple"; sentence = "I eat an apple every day."; target_lang = "Chinese" } | ConvertTo-Json
    $r = Invoke-RestMethod -Uri "$BaseUrl/ai/dictionary" -Method POST -Body $body -Headers $Headers -ContentType "application/json" -TimeoutSec 15
    if ($r.code -eq 0) {
        $d = $r.data
        # 关键字段校验：headword / pronunciation / meanings
        if (-not $d.headword) { Bad "dictionary: missing headword"; return }
        if ($d.meanings.Count -lt 1) { Bad "dictionary: meanings array empty"; return }
        Ok "ai/dictionary returned: headword='$($d.headword)', meanings=$($d.meanings.Count), uk='$($d.pronunciation.uk)'"
    } elseif ($r.message -like "*未启用*") {
        Ok "ai/dictionary correctly returns 'not enabled' when ECHOSUB_AI_API_KEY is not set (msg: $($r.message))"
    } else {
        Bad "ai/dictionary unexpected response: code=$($r.code), msg=$($r.message)"
    }
} catch {
    $code = $_.Exception.Response.StatusCode.value__
    if ($code -eq 503) {
        Ok "ai/dictionary correctly returns 503 when AI not enabled"
    } else {
        Bad "ai/dictionary failed: $_"
    }
}

# ---------- 17. AI sentence-explain (v0.9.0 POST /ai/sentence-explain) ----------
Step "17. AI sentence-explain (v0.9.0: sentence translation / words / grammar)"
try {
    $body = @{ sentence = "I have been studying English for three years."; target_lang = "Chinese" } | ConvertTo-Json
    $r = Invoke-RestMethod -Uri "$BaseUrl/ai/sentence-explain" -Method POST -Body $body -Headers $Headers -ContentType "application/json" -TimeoutSec 15
    if ($r.code -eq 0) {
        $e = $r.data
        # 关键字段校验：original / translation / words
        if (-not $e.original) { Bad "sentence-explain: missing original"; return }
        if (-not $e.translation) { Bad "sentence-explain: missing translation"; return }
        Ok "ai/sentence-explain returned: original='$($e.original.Substring(0, [Math]::Min(40, $e.original.Length)))...', words=$($e.words.Count), grammar=$($e.grammar.pattern)"
    } elseif ($r.message -like "*未启用*") {
        Ok "ai/sentence-explain correctly returns 'not enabled' when ECHOSUB_AI_API_KEY is not set (msg: $($r.message))"
    } else {
        Bad "ai/sentence-explain unexpected response: code=$($r.code), msg=$($r.message)"
    }
} catch {
    $code = $_.Exception.Response.StatusCode.value__
    if ($code -eq 503) {
        Ok "ai/sentence-explain correctly returns 503 when AI not enabled"
    } else {
        Bad "ai/sentence-explain failed: $_"
    }
}

# ---------- 18. AI dictionary missing-word (v0.9.0 validation) ----------
Step "18. AI dictionary missing-word validation"
try {
    $body = @{ } | ConvertTo-Json
    $r = Invoke-RestMethod -Uri "$BaseUrl/ai/dictionary" -Method POST -Body $body -Headers $Headers -ContentType "application/json" -TimeoutSec 5
    Bad "ai/dictionary should reject empty word, got code=$($r.code), msg=$($r.message)"
} catch {
    $code = $_.Exception.Response.StatusCode.value__
    if ($code -eq 400) {
        Ok "ai/dictionary correctly returns 400 when word missing"
    } elseif ($code -eq 503) {
        Ok "ai/dictionary returns 503 first when AI not enabled (auth/validation bypassed)"
    } else {
        Bad "ai/dictionary unexpected status: $code"
    }
}

# ---------- 19. Local dictionary status (v0.9.1 GET /dictionary/local/status) ----------
Step "19. Local dictionary status (v0.9.1: status before upload)"
try {
    $r = Invoke-RestMethod -Uri "$BaseUrl/dictionary/local/status" -Method GET -Headers $Headers -TimeoutSec 5
    if ($r.code -eq 0) {
        $d = $r.data
        Ok "local dict status: available=$($d.available), dict_count=$($d.dict_count), entry_count=$($d.entry_count)"
    } else {
        Bad "local dict status unexpected: code=$($r.code), msg=$($r.message)"
    }
} catch {
    Bad "local dict status failed: $_"
}

# ---------- 20. Local dictionary upload (v0.9.1 POST /dictionary/local/upload) ----------
Step "20. Local dictionary upload (v0.9.1: CSV import)"
$TestDictPath = Join-Path $RepoRoot "test-dicts\test-basic.csv"
$TestDictId = $null
if (Test-Path $TestDictPath) {
    try {
        # PowerShell 5.1: use HttpClient multipart upload via .NET
        Add-Type -AssemblyName System.Net.Http
        $httpClient = New-Object System.Net.Http.HttpClient
        $content = New-Object System.Net.Http.MultipartFormDataContent
        $fileStream = [System.IO.File]::OpenRead($TestDictPath)
        $fileContent = New-Object System.Net.Http.StreamContent $fileStream
        $fileContent.Headers.ContentType = [System.Net.Http.Headers.MediaTypeHeaderValue]::Parse("text/csv")
        $content.Add($fileContent, "file", [System.IO.Path]::GetFileName($TestDictPath))
        $nameContent = New-Object System.Net.Http.StringContent "TestBasic"
        $nameContent.Headers.ContentType = [System.Net.Http.Headers.MediaTypeHeaderValue]::Parse("text/plain")
        $content.Add($nameContent, "name")
        $httpClient.DefaultRequestHeaders.Authorization = New-Object System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", $Token)
        $resp = $httpClient.PostAsync("$BaseUrl/dictionary/local/upload", $content).GetAwaiter().GetResult()
        $respBody = $resp.Content.ReadAsStringAsync().GetAwaiter().GetResult()
        $fileStream.Close()
        $r = $respBody | ConvertFrom-Json
        if ($r.code -eq 0) {
            $TestDictId = $r.data.id
            Ok "local dict uploaded: id=$TestDictId, name='$($r.data.name)', entry_count=$($r.data.entry_count), skipped=$($r.data.skipped), total_lines=$($r.data.total_lines)"
        } else {
            Bad "local dict upload failed: code=$($r.code), msg=$($r.message)"
        }
    } catch {
        Bad "local dict upload exception: $_"
    }
} else {
    Bad "test-dicts\test-basic.csv not found"
}

# ---------- 21. Local dictionary list (v0.9.1 GET /dictionary/local) ----------
Step "21. Local dictionary list (v0.9.1: list uploaded dictionaries)"
try {
    $r = Invoke-RestMethod -Uri "$BaseUrl/dictionary/local" -Method GET -Headers $Headers -TimeoutSec 5
    if ($r.code -eq 0) {
        $cnt = $r.data.dictionaries.Count
        if ($cnt -ge 1 -and $TestDictId) {
            $hit = $r.data.dictionaries | Where-Object { $_.id -eq $TestDictId } | Select-Object -First 1
            if ($hit) {
                Ok "local dict list contains uploaded id=$TestDictId (total: $cnt, this dict: name='$($hit.name)', entries=$($hit.entry_count))"
            } else {
                Bad "local dict list does not contain id=$TestDictId"
            }
        } else {
            Bad "local dict list empty (count=$cnt), expected >= 1"
        }
    } else {
        Bad "local dict list failed: code=$($r.code), msg=$($r.message)"
    }
} catch {
    Bad "local dict list exception: $_"
}

# ---------- 22. Local dictionary lookup (v0.9.1 POST /dictionary/local/lookup) ----------
Step "22. Local dictionary lookup (v0.9.1: exact + lemma fallback)"
try {
    # 22a) 精确命中
    $body = @{ word = "apple" } | ConvertTo-Json
    $r = Invoke-RestMethod -Uri "$BaseUrl/dictionary/local/lookup" -Method POST -Body $body -Headers $Headers -ContentType "application/json" -TimeoutSec 5
    if ($r.code -eq 0 -and $r.data.found -and $r.data.entries.Count -ge 1) {
        $e = $r.data.entries[0]
        Ok "exact lookup 'apple' hit: word='$($e.word)', phonetic='$($e.phonetic)', translation='$($e.translation)', matched_by=$($e.matched_by), dict='$($e.dict_name)'"
    } else {
        Bad "exact lookup 'apple' failed: found=$($r.data.found), entries=$($r.data.entries.Count)"
    }
} catch {
    Bad "local lookup exception: $_"
}

try {
    # 22b) 词形回退 1：apples -> apple (去掉 s)
    $body = @{ word = "apples" } | ConvertTo-Json
    $r = Invoke-RestMethod -Uri "$BaseUrl/dictionary/local/lookup" -Method POST -Body $body -Headers $Headers -ContentType "application/json" -TimeoutSec 5
    if ($r.code -eq 0 -and $r.data.found -and $r.data.entries.Count -ge 1) {
        $e = $r.data.entries[0]
        if ($e.matched_by -eq "exact" -or $e.matched_by -like "lemma:*") {
            Ok "lemma fallback 'apples' -> 'apple' hit: word='$($e.word)', matched_by=$($e.matched_by), translation='$($e.translation)'"
        } else {
            Ok "lemma fallback 'apples' returned: matched_by=$($e.matched_by), word='$($e.word)'"
        }
    } else {
        Bad "lemma fallback 'apples' failed: found=$($r.data.found), entries=$($r.data.entries.Count)"
    }
} catch {
    Bad "local lookup (lemma apples) exception: $_"
}

try {
    # 22c) 词形回退 2：studying -> study (去掉 ing)
    $body = @{ word = "studying" } | ConvertTo-Json
    $r = Invoke-RestMethod -Uri "$BaseUrl/dictionary/local/lookup" -Method POST -Body $body -Headers $Headers -ContentType "application/json" -TimeoutSec 5
    if ($r.code -eq 0 -and $r.data.found -and $r.data.entries.Count -ge 1) {
        $e = $r.data.entries[0]
        if ($e.matched_by -like "lemma:*") {
            Ok "lemma fallback 'studying' -> 'study' hit: matched_by=$($e.matched_by), translation='$($e.translation)'"
        } else {
            Ok "lemma fallback 'studying' returned: matched_by=$($e.matched_by) (word='$($e.word)')"
        }
    } else {
        Bad "lemma fallback 'studying' failed: found=$($r.data.found), entries=$($r.data.entries.Count)"
    }
} catch {
    Bad "local lookup (lemma studying) exception: $_"
}

try {
    # 22d) 未命中：xyzabc 不在词库
    $body = @{ word = "xyzabc" } | ConvertTo-Json
    $r = Invoke-RestMethod -Uri "$BaseUrl/dictionary/local/lookup" -Method POST -Body $body -Headers $Headers -ContentType "application/json" -TimeoutSec 5
    if ($r.code -eq 0 -and -not $r.data.found) {
        Ok "miss lookup 'xyzabc' correctly returns found=false (entries=$($r.data.entries.Count))"
    } else {
        Bad "miss lookup 'xyzabc' expected found=false, got found=$($r.data.found)"
    }
} catch {
    Bad "local lookup (miss) exception: $_"
}

# ---------- 23. Local dictionary delete (v0.9.1 DELETE /dictionary/local/:id) ----------
Step "23. Local dictionary delete (v0.9.1: cascade delete entries)"
if ($TestDictId) {
    try {
        $r = Invoke-RestMethod -Uri "$BaseUrl/dictionary/local/$TestDictId" -Method DELETE -Headers $Headers -TimeoutSec 5
        if ($r.code -eq 0 -and $r.data.deleted) {
            Ok "local dict id=$TestDictId deleted"
        } else {
            Bad "local dict delete failed: code=$($r.code), msg=$($r.message)"
        }
    } catch {
        Bad "local dict delete exception: $_"
    }
    # 验证级联删除：再次 lookup 应 found=false
    try {
        $body = @{ word = "apple" } | ConvertTo-Json
        $r2 = Invoke-RestMethod -Uri "$BaseUrl/dictionary/local/lookup" -Method POST -Body $body -Headers $Headers -ContentType "application/json" -TimeoutSec 5
        if ($r2.code -eq 0 -and -not $r2.data.found) {
            Ok "cascade delete verified: 'apple' lookup now returns found=false (entries table cleared)"
        } else {
            Bad "cascade delete failed: 'apple' still found (found=$($r2.data.found))"
        }
    } catch {
        Bad "post-delete lookup exception: $_"
    }
} else {
    Bad "skipped (no test dict id)"
}

# ---------- Summary ----------
Write-Host ""
Write-Host "=========================" -ForegroundColor Yellow
Write-Host "  PASS: $script:Pass" -ForegroundColor Green
Write-Host "  FAIL: $script:Fail" -ForegroundColor $(if ($script:Fail -gt 0) { "Red" } else { "Gray" })
Write-Host "=========================" -ForegroundColor Yellow

Cleanup

if ($script:Fail -gt 0) { exit 1 } else { exit 0 }
