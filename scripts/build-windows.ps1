param(
  [string]$Destination,
  [string]$NodePath
)
$ErrorActionPreference = 'Stop'
$project = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
if (-not $Destination) { $Destination = Join-Path (Split-Path -Parent $project) 'MORS-AEGIS-Windows' }
$parent = Split-Path -Parent $Destination
if (-not (Test-Path -LiteralPath $parent)) { throw 'Destination parent directory does not exist.' }
$parent = (Resolve-Path -LiteralPath $parent).Path
$destinationAbsolute = Join-Path $parent (Split-Path -Leaf $Destination)
if (Test-Path -LiteralPath $destinationAbsolute) { throw "Destination already exists: $destinationAbsolute. Choose a new empty destination." }
if (-not $NodePath) { $NodePath = (Get-Command node -ErrorAction Stop).Source }
if (-not (Test-Path -LiteralPath $NodePath -PathType Leaf)) { throw 'Node runtime not found.' }
if (-not ((& $NodePath --version) -match '^v(2[6-9]|[3-9][0-9])\.')) { throw 'Bundled Node 26 or newer is required for the current scientific database.' }

New-Item -ItemType Directory -Path $destinationAbsolute | Out-Null
New-Item -ItemType Directory -Path (Join-Path $destinationAbsolute 'runtime') | Out-Null
New-Item -ItemType Directory -Path (Join-Path $destinationAbsolute 'app') | Out-Null
$runtime = Join-Path $destinationAbsolute 'runtime\node.exe'
Copy-Item -LiteralPath $NodePath -Destination $runtime
$nodeLicense = Join-Path (Split-Path -Parent $NodePath) 'LICENSE'
if (Test-Path -LiteralPath $nodeLicense -PathType Leaf) { Copy-Item -LiteralPath $nodeLicense -Destination (Join-Path $destinationAbsolute 'runtime\NODE-LICENSE.txt') }
$app = Join-Path $destinationAbsolute 'app'
foreach ($file in @('server.mjs', 'package.json')) { Copy-Item -LiteralPath (Join-Path $project $file) -Destination $app }
foreach ($dir in @('ms02-connectors', 'ms05-analysis', 'ms09-agents', 'public', 'src')) {
  $source = Join-Path $project $dir
  if (Test-Path -LiteralPath $source -PathType Container) { Copy-Item -LiteralPath $source -Destination (Join-Path $app $dir) -Recurse }
}
$publish = Join-Path $destinationAbsolute 'launcher-build'
& dotnet restore (Join-Path $project 'launcher\MorsLauncher.csproj') --source https://api.nuget.org/v3/index.json --nologo
if ($LASTEXITCODE -ne 0) { throw 'Launcher dependency restore failed.' }
& dotnet publish (Join-Path $project 'launcher\MorsLauncher.csproj') -c Release -r win-x64 --self-contained true --no-restore -p:PublishSingleFile=true -p:PublishTrimmed=false -o $publish --nologo
if ($LASTEXITCODE -ne 0) { throw 'Launcher compilation failed.' }
Copy-Item -LiteralPath (Join-Path $publish 'mors.exe') -Destination (Join-Path $destinationAbsolute 'mors.exe')
if (-not (Test-Path -LiteralPath (Join-Path $destinationAbsolute 'mors.exe'))) { throw 'mors.exe was not produced.' }
$publishAbsolute = [IO.Path]::GetFullPath($publish)
$destinationChecked = [IO.Path]::GetFullPath($destinationAbsolute).TrimEnd([IO.Path]::DirectorySeparatorChar)
if (-not $publishAbsolute.StartsWith($destinationChecked + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe build cleanup path.' }
Remove-Item -LiteralPath $publishAbsolute -Recurse -Force
@'
MORS AEGIS Windows distribution
Double-click mors.exe to open the local application in your default browser.
Right-click the MORS system tray icon and choose Exit to stop the local service.
The application binds to the private LAN and stores its SQLite database under %LOCALAPPDATA%\MORS-AEGIS\data. Right-click the tray icon and choose LAN access details to see the address and private access token. Share the token only with trusted users on your private network. The Windows Firewall rule is scoped to the Private profile and local subnet.
API keys are not included. Configure MORS_CREDENTIALS_FILE in your environment or use the existing Desktop key file on this machine.
'@ | Set-Content -LiteralPath (Join-Path $destinationAbsolute 'README-Windows.txt') -Encoding utf8
$excluded = @(Get-ChildItem -LiteralPath $destinationAbsolute -Recurse -File | Where-Object { $_.Name -match '(?i)^\.env$|credential|new text document \(2\)' })
if ($excluded.Count) { throw 'Potential credential file found in distribution.' }
$exe = Get-Item -LiteralPath (Join-Path $destinationAbsolute 'mors.exe')
Write-Output "Built: $($exe.FullName) ($($exe.Length) bytes)"
