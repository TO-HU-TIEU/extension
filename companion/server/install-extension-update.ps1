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
    if ($entry.FullName -notmatch '^[a-zA-Z0-9_-]+\.(js|css|svg|json|txt)$' -or $entry.FullName -eq 'config.local.js') { throw 'Invalid archive path or personal config' }
    if ($names -contains $entry.FullName) { throw 'Duplicate archive file' }
    $names += $entry.FullName
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
    if (Test-Path -LiteralPath $destination) { Copy-Item -LiteralPath $destination -Destination (Join-Path $backup $name) }
    else { $created += $name }
  }
  foreach ($name in $names) { Copy-Item -LiteralPath (Join-Path $stage $name) -Destination (Join-Path $targetRoot $name) -Force }
} catch {
  foreach ($file in Get-ChildItem -LiteralPath $backup -File) { Copy-Item -LiteralPath $file.FullName -Destination (Join-Path $targetRoot $file.Name) -Force }
  foreach ($name in $created) { $file = Join-Path $targetRoot $name; if (Test-Path -LiteralPath $file) { Remove-Item -LiteralPath $file -Force } }
  throw
}
