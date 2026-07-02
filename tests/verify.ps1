$ErrorActionPreference = 'Stop'
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

if ($html -match 'fetch\s*\(|XMLHttpRequest|WebSocket\s*\(') { throw 'Unexpected network API found' }
Write-Host 'VERIFY_OK: tests, syntax, controls, and local-only policy passed.'
