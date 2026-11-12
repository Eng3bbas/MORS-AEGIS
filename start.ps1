$ErrorActionPreference = 'Stop'
$project = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $project
# Settings come from .env in the project folder (copy .env.example). To use a separate
# credentials file, opt in explicitly with MORS_CREDENTIALS_FILE in .env or the environment.
if (-not (Test-Path -LiteralPath (Join-Path $project '.env'))) {
  Write-Host 'No .env found; copy .env.example to .env to configure provider keys.'
}
Write-Host 'Starting MORS AEGIS on http://127.0.0.1:4173'
Write-Host 'Credentials are read by the local server only; values are never printed.'
node server.mjs
