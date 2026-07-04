Add-Type -AssemblyName System.Drawing
$ErrorActionPreference = "Stop"
$scriptDir = "d:\Code\Go\EchoSub\frontend\public"
Set-Location $scriptDir
$source = [System.Drawing.Image]::FromFile((Join-Path $scriptDir "android-chrome-512x512.png"))
foreach ($size in @(120, 152, 167, 180)) {
  $bmp = New-Object System.Drawing.Bitmap($size, $size)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.DrawImage($source, 0, 0, $size, $size)
  $outName = Join-Path $scriptDir ("apple-touch-icon-" + $size + "x" + $size + ".png")
  $bmp.Save($outName, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose()
  $bmp.Dispose()
  if (Test-Path $outName) {
    $info = Get-Item $outName
    Write-Host ("Generated {0} ({1} x {2}, {3} bytes)" -f $outName, $size, $size, $info.Length)
  } else {
    Write-Host ("FAILED: {0}" -f $outName)
  }
}
$source.Dispose()
Write-Host "All icon sizes generated."
