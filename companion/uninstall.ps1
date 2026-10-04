$ErrorActionPreference = 'SilentlyContinue'
Remove-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -Name 'XReplyAssistantCompanion'
Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*X Reply Assistant*server.mjs*' } | ForEach-Object { Stop-Process -Id $_.ProcessId }
$companionRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$accountData = Join-Path $companionRoot 'server\.data'
if (Test-Path -LiteralPath $accountData) { Remove-Item -LiteralPath $accountData -Recurse -Force }
Write-Host 'Đã gỡ companion và xóa dữ liệu đăng nhập cục bộ.'
