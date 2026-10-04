$ErrorActionPreference = 'SilentlyContinue'
Remove-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -Name 'AssistantExtensionUpdater'
$companionRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$serverEntry = Join-Path $companionRoot 'server\server.mjs'
Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -like "*$serverEntry*" } | ForEach-Object { Stop-Process -Id $_.ProcessId }
Write-Host 'Đã tắt trình cập nhật và gỡ tự khởi động. Dữ liệu kết nối được giữ nguyên.'
