param([string]$ExtensionPath,[string]$NodePath)
$ErrorActionPreference = 'Stop'
$packageRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$companionRoot = Join-Path $env:LOCALAPPDATA 'AssistantUpdater'
if (-not $ExtensionPath) { $ExtensionPath = Join-Path (Split-Path -Parent $packageRoot) 'x-reply-assistant' }
if (-not (Test-Path -LiteralPath (Join-Path $ExtensionPath 'manifest.json'))) {
  Add-Type -AssemblyName System.Windows.Forms
  $picker = New-Object System.Windows.Forms.FolderBrowserDialog
  $picker.Description = 'Chọn thư mục Assistant đang dùng trong Chrome'
  if ($picker.ShowDialog() -ne 'OK') { throw 'Chưa chọn thư mục extension.' }
  $ExtensionPath = $picker.SelectedPath
}
New-Item -ItemType Directory -Path $companionRoot -Force | Out-Null
if ([IO.Path]::GetFullPath($packageRoot) -ne [IO.Path]::GetFullPath($companionRoot)) {
  Get-ChildItem -LiteralPath $packageRoot -Recurse -File | ForEach-Object {
    $relative = $_.FullName.Substring($packageRoot.Length + 1)
    if ($relative -notmatch '(^|\\)\.data(\\|$)' -and $relative -notmatch 'config\.local\.(mjs|js)$') {
      $destination = Join-Path $companionRoot $relative
      New-Item -ItemType Directory -Path (Split-Path -Parent $destination) -Force | Out-Null
      Copy-Item -LiteralPath $_.FullName -Destination $destination -Force
    }
  }
}
$startScript = Join-Path $companionRoot 'start.ps1'
$serverConfig = Join-Path $companionRoot 'server\config.local.mjs'
$extensionConfig = Join-Path (Split-Path -Parent $companionRoot) 'x-reply-assistant\config.local.js'
if ($NodePath) { Copy-Item -LiteralPath $NodePath -Destination (Join-Path $companionRoot 'node.exe') -Force }
$nodeExecutable = Join-Path $companionRoot 'node.exe'
if (-not (Test-Path -LiteralPath $nodeExecutable)) { $nodeExecutable = (Get-Command node -ErrorAction Stop).Source }
& $nodeExecutable (Join-Path $companionRoot 'configure.mjs') $companionRoot $ExtensionPath
if ($LASTEXITCODE -ne 0) { throw 'Không liên kết được trình cập nhật.' }
$runCommand = "powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$startScript`""
New-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -Name 'AssistantExtensionUpdater' -Value $runCommand -PropertyType String -Force | Out-Null
Start-Process powershell.exe -WindowStyle Hidden -ArgumentList @('-NoProfile','-WindowStyle','Hidden','-ExecutionPolicy','Bypass','-File',$startScript)
Write-Host 'Đã cài trình cập nhật. Tải lại Assistant một lần. Các lần sau bấm Cập nhật ngay, không cần giải nén ZIP.'
