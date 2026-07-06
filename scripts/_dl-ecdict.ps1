#!/usr/bin/env pwsh
# Download ECDICT CSV from GitHub release
$ErrorActionPreference = 'Stop'
$url = 'https://raw.githubusercontent.com/skywind3000/ECDICT/master/ecdict.csv'
$out = 'D:\Code\Go\EchoSub\backend\data\dict\ecdict.csv'
Write-Host 'Downloading ECDICT...'
Invoke-WebRequest -Uri $url -OutFile $out -UseBasicParsing
$size = (Get-Item $out).Length
Write-Host ("OK: {0} ({1:N1} MB)" -f $out, ($size / 1MB))
