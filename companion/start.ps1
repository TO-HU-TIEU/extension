$ErrorActionPreference = 'Stop'
$companionRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$serverEntry = Join-Path $companionRoot 'server\server.mjs'
$existing = Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like "*$serverEntry*" }
if ($existing) { exit 0 }
$nodeExecutable = Join-Path $companionRoot 'node.exe'
if (-not (Test-Path -LiteralPath $nodeExecutable)) { $nodeExecutable = (Get-Command node -ErrorAction Stop).Source }
& $nodeExecutable $serverEntry
