$ErrorActionPreference = 'Stop'

node scripts/build.cjs --check
if ($LASTEXITCODE -ne 0) { throw 'Generated HTML artifacts are stale' }
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$htmlPath = (Get-ChildItem $repoRoot -File -Filter '*.html' | Select-Object -First 1).FullName
if (-not $htmlPath) { throw 'Target HTML not found' }
$testRoot = $PSScriptRoot

& node --test "$testRoot\algorithm.test.cjs" "$testRoot\integration.test.cjs"
if ($LASTEXITCODE -ne 0) { throw 'Regression tests failed' }

$html = [IO.File]::ReadAllText($htmlPath, [Text.Encoding]::UTF8)
$scripts = [regex]::Matches($html, '<script(?:[^>]*)>([\s\S]*?)</script>')
if ($scripts.Count -ne 3) { throw "Expected 3 script blocks, found $($scripts.Count)" }

foreach ($index in 1, 2) {
  $scripts[$index].Groups[1].Value | & node --check -
  if ($LASTEXITCODE -ne 0) { throw "Script block $index failed syntax check" }
}

foreach ($id in 'dir','btnA','btnM','matchTable','workerSrc') {
  if ($html -notmatch ('id="' + [regex]::Escape($id) + '"')) { throw "Missing HTML element: $id" }
}

$publicHtml = Join-Path $repoRoot 'public\index.html'
if (-not (Test-Path $publicHtml)) { throw 'Missing public/index.html' }
if ((Get-FileHash $htmlPath -Algorithm SHA256).Hash -ne (Get-FileHash $publicHtml -Algorithm SHA256).Hash) {
  throw 'public/index.html is not synchronized with the source HTML'
}

$wrangler = Get-Content (Join-Path $repoRoot 'wrangler.jsonc') -Raw | ConvertFrom-Json
if ($wrangler.name -ne 'kline-similarity-tool' -or $wrangler.assets.directory -ne './public' -or
    $wrangler.assets.not_found_handling -ne 'single-page-application') {
  throw 'Invalid Cloudflare Static Assets configuration'
}

if ($html -match 'fetch\s*\(|XMLHttpRequest|WebSocket\s*\(|sendBeacon\s*\(') { throw 'Unexpected network API found' }
if ($html -match '<(?:script|img|link)\b[^>]*(?:src|href)\s*=\s*["'']https?://' -or
    $html -match '<form\b[^>]*action\s*=\s*["'']https?://' -or
    $html -match 'createElement\s*\(\s*["'']script["'']\s*\)') {
  throw 'Unexpected external resource or dynamic script loading found'
}
Write-Host 'VERIFY_OK: tests, syntax, controls, static deployment, and local-only policy passed.'
