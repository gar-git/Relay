# Regenerates NSIS sidebar/header BMPs and multi-size icon.ico from build/icon.png
Add-Type -AssemblyName System.Drawing

$ErrorActionPreference = 'Stop'
$build = Split-Path -Parent $MyInvocation.MyCommand.Path
$iconPath = Join-Path $build 'icon.png'
if (-not (Test-Path $iconPath)) { throw "Missing $iconPath" }

$src = [System.Drawing.Image]::FromFile($iconPath)

function New-Bmp($w, $h) {
  $bmp = New-Object System.Drawing.Bitmap $w, $h
  $bmp.SetResolution(72, 72)
  return $bmp
}

function Save-Bmp24($bmp, $path) {
  $rect = New-Object System.Drawing.Rectangle 0, 0, $bmp.Width, $bmp.Height
  $clone = $bmp.Clone($rect, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
  $clone.Save($path, [System.Drawing.Imaging.ImageFormat]::Bmp)
  $clone.Dispose()
}

# Sidebar 164x314
$side = New-Bmp 164 314
$g = [System.Drawing.Graphics]::FromImage($side)
$g.SmoothingMode = 'AntiAlias'
$g.TextRenderingHint = 'ClearTypeGridFit'
$g.InterpolationMode = 'HighQualityBicubic'
$bgBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush (
  (New-Object System.Drawing.Point 0, 0),
  (New-Object System.Drawing.Point 164, 314),
  [System.Drawing.Color]::FromArgb(255, 15, 18, 24),
  [System.Drawing.Color]::FromArgb(255, 18, 40, 72)
)
$g.FillRectangle($bgBrush, 0, 0, 164, 314)
$accent = New-Object System.Drawing.Drawing2D.LinearGradientBrush (
  (New-Object System.Drawing.Point 0, 40),
  (New-Object System.Drawing.Point 164, 220),
  [System.Drawing.Color]::FromArgb(70, 90, 159, 255),
  [System.Drawing.Color]::FromArgb(10, 26, 79, 156)
)
$g.FillEllipse($accent, -40, 20, 220, 200)
$logoSize = 72
$g.DrawImage($src, [int]((164 - $logoSize) / 2), 70, $logoSize, $logoSize)
$fontTitle = New-Object System.Drawing.Font 'Segoe UI', 18, ([System.Drawing.FontStyle]::Bold)
$fontSub = New-Object System.Drawing.Font 'Segoe UI', 9
$titleBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 232, 237, 245))
$subBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(220, 90, 159, 255))
$muted = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(180, 154, 168, 188))
$fontTiny = New-Object System.Drawing.Font 'Segoe UI', 8
$sf = New-Object System.Drawing.StringFormat
$sf.Alignment = 'Center'
$g.DrawString('RELAY', $fontTitle, $titleBrush, (New-Object System.Drawing.RectangleF 0, 160, 164, 36), $sf)
$g.DrawString('API Client', $fontSub, $subBrush, (New-Object System.Drawing.RectangleF 0, 192, 164, 24), $sf)
$g.DrawString('Local-first workspaces', $fontTiny, $muted, (New-Object System.Drawing.RectangleF 8, 275, 148, 20), $sf)
Save-Bmp24 $side (Join-Path $build 'installerSidebar.bmp')
$side.Dispose(); $g.Dispose()

# Header 150x57
$header = New-Bmp 150 57
$hg = [System.Drawing.Graphics]::FromImage($header)
$hg.SmoothingMode = 'AntiAlias'
$hg.TextRenderingHint = 'ClearTypeGridFit'
$hg.InterpolationMode = 'HighQualityBicubic'
$hbg = New-Object System.Drawing.Drawing2D.LinearGradientBrush (
  (New-Object System.Drawing.Point 0, 0),
  (New-Object System.Drawing.Point 150, 57),
  [System.Drawing.Color]::FromArgb(255, 18, 28, 44),
  [System.Drawing.Color]::FromArgb(255, 22, 50, 90)
)
$hg.FillRectangle($hbg, 0, 0, 150, 57)
$hg.DrawImage($src, 12, 10, 36, 36)
$hFont = New-Object System.Drawing.Font 'Segoe UI', 12, ([System.Drawing.FontStyle]::Bold)
$hBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 232, 237, 245))
$hg.DrawString('Relay Setup', $hFont, $hBrush, 56, 16)
Save-Bmp24 $header (Join-Path $build 'installerHeader.bmp')
$header.Dispose(); $hg.Dispose()

# ICO
function New-IconImage($size) {
  $b = New-Object System.Drawing.Bitmap $size, $size
  $b.SetResolution(72, 72)
  $gg = [System.Drawing.Graphics]::FromImage($b)
  $gg.SmoothingMode = 'AntiAlias'
  $gg.InterpolationMode = 'HighQualityBicubic'
  $gg.Clear([System.Drawing.Color]::Transparent)
  $gg.DrawImage($src, 0, 0, $size, $size)
  $gg.Dispose()
  return $b
}

$sizes = @(16, 32, 48, 64, 128, 256)
$images = @()
foreach ($s in $sizes) { $images += (New-IconImage $s) }
$icoPath = Join-Path $build 'icon.ico'
$ms = New-Object System.IO.MemoryStream
$bw = New-Object System.IO.BinaryWriter $ms
$bw.Write([uint16]0)
$bw.Write([uint16]1)
$bw.Write([uint16]$images.Count)
$offset = 6 + (16 * $images.Count)
$pngBlobs = @()
foreach ($img in $images) {
  $pms = New-Object System.IO.MemoryStream
  $img.Save($pms, [System.Drawing.Imaging.ImageFormat]::Png)
  $pngBlobs += , $pms.ToArray()
  $pms.Dispose()
}
for ($i = 0; $i -lt $images.Count; $i++) {
  $img = $images[$i]
  $blob = $pngBlobs[$i]
  $w = if ($img.Width -ge 256) { 0 } else { $img.Width }
  $h = if ($img.Height -ge 256) { 0 } else { $img.Height }
  $bw.Write([byte]$w)
  $bw.Write([byte]$h)
  $bw.Write([byte]0)
  $bw.Write([byte]0)
  $bw.Write([uint16]1)
  $bw.Write([uint16]32)
  $bw.Write([uint32]$blob.Length)
  $bw.Write([uint32]$offset)
  $offset += $blob.Length
}
foreach ($blob in $pngBlobs) { $bw.Write($blob) }
$bw.Flush()
[System.IO.File]::WriteAllBytes($icoPath, $ms.ToArray())
$bw.Dispose(); $ms.Dispose()
foreach ($img in $images) { $img.Dispose() }
$src.Dispose()
Write-Host "Updated installer assets in $build"
