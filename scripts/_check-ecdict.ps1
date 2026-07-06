#!/usr/bin/env pwsh
$path = 'D:\Code\Go\EchoSub\backend\data\dict\ecdict.csv'
if (Test-Path $path) {
    $f = Get-Item $path
    $mb = [math]::Round($f.Length / 1MB, 2)
    Write-Host "EXISTS: ${mb}MB"
} else {
    Write-Host 'NOT-DOWNLOADED'
}
