$ErrorActionPreference = 'Stop'

node scripts/build.cjs --check
if ($LASTEXITCODE -ne 0) { throw 'Generated HTML artifacts are stale' }
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$htmlPath = (Get-ChildItem $repoRoot -File -Filter '*.html' | Select-Object -First 1).FullName
if (-not $htmlPath) { throw 'Target HTML not found' }
$testRoot = $PSScriptRoot

& npm test
if ($LASTEXITCODE -ne 0) { throw 'Regression tests failed' }
Write-Host 'VERIFY_OK: tests, syntax, controls, static deployment, and local-only policy passed.'
