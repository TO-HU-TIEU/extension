param([Parameter(Mandatory)][string]$Archive,[Parameter(Mandatory)][string]$Target,[Parameter(Mandatory)][string]$Version)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$targetRoot = (Resolve-Path -LiteralPath $Target).Path
$oldManifest = Get-Content -LiteralPath (Join-Path $targetRoot 'manifest.json') | ConvertFrom-Json
if ($oldManifest.name -ne 'Assistant') { throw 'Invalid installation directory' }
$stage = Join-Path (Split-Path -Parent $Archive) 'stage'
$backup = Join-Path $targetRoot '.update-backup'
$archiveFile = [IO.Compression.ZipFile]::OpenRead($Archive)
$total = 0
$names = @()
try {
  foreach ($entry in $archiveFile.Entries) {
    if ($entry.FullName.EndsWith('/')) { continue }
    $relative = $entry.FullName.Replace('/', '\')
    if ($relative -match '(^|\\)\.\.(\\|$)' -or [IO.Path]::IsPathRooted($relative) -or $relative -notmatch '^[a-zA-Z0-9_.-]+(\\[a-zA-Z0-9_.-]+)*\.(js|css|svg|json|txt|html|png|jpg|jpeg|gif|webp|ico|woff2)$' -or $relative -eq 'config.local.js') { throw ('Invalid archive path or personal config: ' + $entry.FullName) }
    if ($names -contains $relative) { throw 'Duplicate archive file' }
    $names += $relative
    $total += $entry.Length
    if ($total -gt 15728640) { throw 'Archive exceeds size limit' }
  }
} finally { $archiveFile.Dispose() }
[IO.Compression.ZipFile]::ExtractToDirectory($Archive, $stage)
$manifest = Get-Content -LiteralPath (Join-Path $stage 'manifest.json') | ConvertFrom-Json
if ($manifest.name -ne 'Assistant' -or $manifest.manifest_version -ne 3 -or $manifest.version -ne $Version) { throw 'Invalid update manifest' }
$backupRoot = [IO.Path]::GetFullPath($backup)
if (-not $backupRoot.StartsWith($targetRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Invalid backup directory' }
if (Test-Path -LiteralPath $backup) { Remove-Item -LiteralPath $backup -Recurse -Force }
New-Item -ItemType Directory -Path $backup | Out-Null
$created = @()
try {
  foreach ($name in $names) {
    $destination = Join-Path $targetRoot $name
    $destinationFull = [IO.Path]::GetFullPath($destination)
    if (-not $destinationFull.StartsWith($targetRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Invalid archive destination' }
    if (Test-Path -LiteralPath $destination) {
      $backupFile = Join-Path $backup $name
      New-Item -ItemType Directory -Path (Split-Path -Parent $backupFile) -Force | Out-Null
      Copy-Item -LiteralPath $destination -Destination $backupFile
    }
    else { $created += $name }
  }
  foreach ($name in $names) {
    $destination = Join-Path $targetRoot $name
    New-Item -ItemType Directory -Path (Split-Path -Parent $destination) -Force | Out-Null
    Copy-Item -LiteralPath (Join-Path $stage $name) -Destination $destination -Force
  }
} catch {
  foreach ($file in Get-ChildItem -LiteralPath $backup -Recurse -File) {
    $relative = $file.FullName.Substring($backup.Length + 1)
    $destination = Join-Path $targetRoot $relative
    New-Item -ItemType Directory -Path (Split-Path -Parent $destination) -Force | Out-Null
    Copy-Item -LiteralPath $file.FullName -Destination $destination -Force
  }
  foreach ($name in $created) { $file = Join-Path $targetRoot $name; if (Test-Path -LiteralPath $file) { Remove-Item -LiteralPath $file -Force } }
  throw
}
