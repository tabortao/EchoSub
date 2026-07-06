#!/usr/bin/env pwsh
# Run go build / vet / test in backend/
$ErrorActionPreference = 'Continue'
Set-Location D:\Code\Go\EchoSub\backend
$env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
$env:GOPROXY = 'https://goproxy.cn,direct'
Write-Host '=== go build ./... ===' -ForegroundColor Cyan
go build ./...
Write-Host ("BUILD-EXIT=$LASTEXITCODE") -ForegroundColor Yellow
Write-Host ''
Write-Host '=== go vet ./... ===' -ForegroundColor Cyan
go vet ./...
Write-Host ("VET-EXIT=$LASTEXITCODE") -ForegroundColor Yellow
Write-Host ''
Write-Host '=== go test ./... ===' -ForegroundColor Cyan
go test ./... -count=1
Write-Host ("TEST-EXIT=$LASTEXITCODE") -ForegroundColor Yellow
