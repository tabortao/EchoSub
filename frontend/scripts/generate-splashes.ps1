Add-Type -AssemblyName System.Drawing
$ErrorActionPreference = "Stop"
$scriptDir = "d:\Code\Go\EchoSub\frontend\public"
Set-Location $scriptDir
$icon = [System.Drawing.Image]::FromFile((Join-Path $scriptDir "android-chrome-512x512.png"))
$devices = @(
  @{ Name = "iphone-x";      W = 1125; H = 2436 },
  @{ Name = "iphone-xr";     W = 828;  H = 1792 },
  @{ Name = "iphone-xsmax";  W = 1242; H = 2688 },
  @{ Name = "iphone-12";     W = 1170; H = 2532 },
  @{ Name = "iphone-12-mini";W = 1080; H = 2340 },
  @{ Name = "iphone-12-max"; W = 1284; H = 2778 },
  @{ Name = "iphone-14-pro"; W = 1179; H = 2556 },
  @{ Name = "iphone-14-promax"; W = 1290; H = 2796 },
  @{ Name = "ipad";          W = 1536; H = 2048 },
  @{ Name = "ipad-pro-11";   W = 1668; H = 2388 },
  @{ Name = "ipad-pro-129";  W = 2048; H = 2732 }
)
foreach ($d in $devices) {
  $w = $d.W
  $h = $d.H
  $name = $d.Name
  $bmp = New-Object System.Drawing.Bitmap($w, $h)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAlias
  $g.Clear([System.Drawing.Color]::FromArgb(255, 255, 249, 240))
  $iconSize = [int]([Math]::Min($w, $h) * 0.28)
  $iconX = [int](($w - $iconSize) / 2)
  $iconY = [int](($h - $iconSize) / 2 - $iconSize * 0.3)
  $g.DrawImage($icon, $iconX, $iconY, $iconSize, $iconSize)
  $titleSize = [int]($iconSize * 0.18)
  $titleY = $iconY + $iconSize + [int]($iconSize * 0.35)
  $titleFont = New-Object System.Drawing.Font("Microsoft YaHei UI", $titleSize, [System.Drawing.FontStyle]::Bold)
  $titleBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 31, 41, 55))
  $titleFmt = New-Object System.Drawing.StringFormat
  $titleFmt.Alignment = [System.Drawing.StringAlignment]::Center
  $titleFmt.LineAlignment = [System.Drawing.StringAlignment]::Center
  $titleRect = New-Object System.Drawing.RectangleF(0, $titleY, $w, [int]($titleSize * 1.6))
  $g.DrawString("EchoSub", $titleFont, $titleBrush, $titleRect, $titleFmt)
  $subSize = [int]($titleSize * 0.42)
  $subFont = New-Object System.Drawing.Font("Microsoft YaHei UI", $subSize, [System.Drawing.FontStyle]::Regular)
  $subBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 140, 140, 140))
  $titleY2 = $titleY + [int]($titleSize * 1.5)
  $subRect = New-Object System.Drawing.RectangleF(0, $titleY2, $w, [int]($subSize * 1.8))
  $g.DrawString("Yu Yan Xue Xi Yu Wen Bei Song", $subFont, $subBrush, $subRect, $titleFmt)
  $outName = Join-Path $scriptDir ("apple-touch-startup-" + $name + ".png")
  $bmp.Save($outName, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose()
  $bmp.Dispose()
  if (Test-Path $outName) {
    $info = Get-Item $outName
    Write-Host ("Generated {0} ({1} x {2}, {3} bytes)" -f $outName, $w, $h, $info.Length)
  } else {
    Write-Host ("FAILED: {0}" -f $outName)
  }
}
$icon.Dispose()
Write-Host "All splash screens generated."