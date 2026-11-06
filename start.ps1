$ErrorActionPreference = 'Stop'
$project = Split-Path -Parent $MyInvocation.MyCommand.Path
$keys = Join-Path $env:USERPROFILE 'Desktop\New Text Document (2).txt'
if (Test-Path -LiteralPath $keys) { $env:MORS_CREDENTIALS_FILE = $keys }
Set-Location -LiteralPath $project
Write-Host 'Starting MORS AEGIS on http://127.0.0.1:4173'
Write-Host 'Credentials are read by the local server only; values are never printed.'
node server.mjs
