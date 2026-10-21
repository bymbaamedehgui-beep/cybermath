# PPTX → MP4 (PowerPoint COM). Анимейшн/шилжилт/томьёо PowerPoint-оор яг рэндэрлэгдэнэ.
#   powershell -ExecutionPolicy Bypass -File export.ps1 -Pptx "файл.pptx" -Out "гаралтын хавтас" [-Gap 1.2] [-EndHold 1.2]
# Эх файлд ХҮРЭХГҮЙ — хуулбар дээр ажиллана.
#
# Видеон дээр товшилт ба слайдын төгсгөлийг кадрын нарийвчлалтай тэмдэглэх арга:
#   слайдын ДООД ирмэгт бүтэн өргөнтэй нимгэн зурвас (MARK_H) нэмнэ —
#     товшилт бүрийн өмнө: ягаан зурвас Gap секунд харагдана (Appear → Gap → Disappear), дараа нь эх эффект эхэлнэ;
#     слайдын төгсгөлд:   цэнхэр зурвас EndHold секунд харагдана.
#   ppt2hls.js зурвасын өнгийг кадр бүрээр уншиж зогсох цэгүүдийг олоод, эцсийн видеоноос тэр зурвасыг ТАЙРНА.
param(
  [Parameter(Mandatory = $true)][string]$Pptx,
  [Parameter(Mandatory = $true)][string]$Out,
  [double]$Gap = 1.2,
  [int]$Height = 720,
  [double]$EndHold = 1.2,
  [switch]$Force
)
$ErrorActionPreference = 'Stop'
$MARK_H = 0.012                       # зурвасын өндөр (слайдын өндрийн хувь)
$RGB_G = 255 + 0 * 256 + 255 * 65536  # ягаан  (R + G*256 + B*65536)
$RGB_E = 0 + 255 * 256 + 255 * 65536  # цэнхэр-ногоон (cyan) — сондгой слайдын төгсгөл
$RGB_G2 = 0 + 0 * 256 + 255 * 65536   # цэнхэр — тэгш дугаартай товшилт
$RGB_E2 = 255 + 255 * 256 + 0 * 65536 # шар — тэгш слайдын төгсгөл
# Өнгийг ээлжлүүлдэг нь: тэмдэг дундуураа хэдэн кадр тасарвал (ижил өнгө, хооронд өөр тэмдэггүй) нэгтгэж болно
New-Item -ItemType Directory -Force $Out | Out-Null
$work = Join-Path $Out 'work.pptx'
Copy-Item -LiteralPath $Pptx -Destination $work -Force

function Add-Mark($sl, $W, $H, $rgb, $name) {
  $mh = [Math]::Max(2.0, $H * $MARK_H)
  $s = $sl.Shapes.AddShape(1, 0, $H - $mh, $W, $mh)   # NB: PowerShell-д $h ба $H нэг хувьсагч     # msoShapeRectangle
  $s.Name = $name
  $s.Line.Visible = 0
  $s.Fill.Solid()
  $s.Fill.ForeColor.RGB = $rgb
  $s.Fill.Transparency = 0
  $s.Shadow.Visible = 0
  return $s
}

# PowerPoint нь нэг instance-тай: хэрэглэгч ажиллаж байхад (слайд үзүүлж байхад) COM нь ТЭР цонхонд холбогдоно.
# Тиймээс нээлттэй бол ажиллахгүй; -Force үед ч хэрэглэгчийн PowerPoint-ыг ХААХГҮЙ (зөвхөн өөрийн файлаа хаана).
$wasRunning = [bool](Get-Process POWERPNT -ErrorAction SilentlyContinue)
if ($wasRunning -and -not $Force) { throw 'PowerPoint нээлттэй байна. Хаагаад дахин ажиллуулна уу (-Force: нээлттэй байхад ажиллуулах, PowerPoint-ыг хаахгүй).' }
$pp = New-Object -ComObject PowerPoint.Application
$pres = $null
try {
  $pres = $pp.Presentations.Open($work, $false, $false, $false)
  $W = [double]$pres.PageSetup.SlideWidth; $H = [double]$pres.PageSetup.SlideHeight
  $n = $pres.Slides.Count
  $meta = @()
  $vi = 0                               # харагдах слайдын дугаар (нуусан слайдыг алгасна) — төгсгөлийн өнгө ээлжлэхэд
  for ($i = 1; $i -le $n; $i++) {
    $sl = $pres.Slides.Item($i)
    $hidden = [bool]($sl.SlideShowTransition.Hidden -eq -1)
    $seq = $sl.TimeLine.MainSequence
    $total = $seq.Count
    # Эх товшилтын эффектүүдийг эхлээд цуглуулна (оруулалт индексийг шилжүүлдэг тул обьектоор нь барина)
    $clickEffects = @()
    for ($j = 1; $j -le $seq.Count; $j++) { $e = $seq.Item($j); if ($e.Timing.TriggerType -eq 1) { $clickEffects += $e } }
    $k = 0
    if (-not $hidden) {
      $vi++
      foreach ($e in $clickEffects) {
        $k++
        $mk = Add-Mark $sl $W $H $(if ($k % 2) { $RGB_G } else { $RGB_G2 }) ("cmMarkG$k")
        $d = [double]$e.Timing.TriggerDelayTime
        $idx = $e.Index
        $a = $seq.AddEffect($mk, 1, 0, 3, $idx)            # Appear, өмнөхийн дараа
        $a.Timing.TriggerDelayTime = 0
        $b = $seq.AddEffect($mk, 1, 0, 3, $idx + 1)        # Disappear (Exit) Gap секундын дараа
        $b.Exit = -1
        $b.Timing.TriggerDelayTime = $Gap
        $e.Timing.TriggerType = 3                          # эх эффект: өмнөхийн (Disappear) дараа, эх саатлаараа
        $e.Timing.TriggerDelayTime = $d
      }
      $me = Add-Mark $sl $W $H $(if ($vi % 2) { $RGB_E } else { $RGB_E2 }) 'cmMarkE'
      $z = $seq.AddEffect($me, 1, 0, 3, -1)                # слайдын төгсгөл
      $z.Timing.TriggerDelayTime = 0
      $z2 = $seq.AddEffect($me, 1, 0, 3, -1)               # EndHold секундын дараа алга болно → слайд дор хаяж EndHold харагдана
      $z2.Exit = -1
      $z2.Timing.TriggerDelayTime = $EndHold
    }
    $meta += [pscustomobject]@{ n = $i; clicks = $clickEffects.Count; effects = $total; hidden = $hidden }
  }

  $t0 = Get-Date
  $pres.CreateVideo((Join-Path $Out 'deck.mp4'), $false, $EndHold, $Height, 25, 85)
  $w = Get-Date
  while ($pres.CreateVideoStatus -eq 1 -or $pres.CreateVideoStatus -eq 2) {
    Start-Sleep -Milliseconds 500
    if (((Get-Date) - $w).TotalSeconds -gt 7200) { throw 'deck video timeout' }
  }
  if ($pres.CreateVideoStatus -ne 3) { throw "CreateVideoStatus=$($pres.CreateVideoStatus)" }
  $info = [pscustomobject]@{
    source = (Split-Path $Pptx -Leaf); slides = $meta; gap = $Gap; endHold = $EndHold; markH = $MARK_H
    width = $W; height = $H; seconds = [int]((Get-Date) - $t0).TotalSeconds
  }
  $info | ConvertTo-Json -Depth 5 | Out-File -Encoding utf8 (Join-Path $Out 'export.json')
  Write-Host ("OK {0} sec" -f $info.seconds)
}
finally {
  if ($pres) { $pres.Saved = $true; $pres.Close() }
  if (-not $wasRunning -and $pp.Presentations.Count -eq 0) { $pp.Quit() }
  [System.Runtime.InteropServices.Marshal]::ReleaseComObject($pp) | Out-Null
  Remove-Item -LiteralPath $work -Force -ErrorAction SilentlyContinue
}
