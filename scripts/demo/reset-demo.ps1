# 重置演示数据库：只允许操作仓库 data 目录的直接子目录，绝不影响 data/smart_learning.db。
#
# 用法：
#   pwsh -File scripts/demo/reset-demo.ps1          # 交互确认
#   pwsh -File scripts/demo/reset-demo.ps1 -Yes     # 跳过确认（自动化用）
#   pwsh -File scripts/demo/reset-demo.ps1 -DemoDataDir data/demo-acceptance
[CmdletBinding()]
param(
    [switch]$Yes,
    [string]$DemoDataDir = 'data\demo'
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$dataRoot = [System.IO.Path]::GetFullPath((Join-Path $root 'data')).TrimEnd('\')
if ([System.IO.Path]::IsPathRooted($DemoDataDir)) {
    $demoDir = [System.IO.Path]::GetFullPath($DemoDataDir)
} else {
    $demoDir = [System.IO.Path]::GetFullPath((Join-Path $root $DemoDataDir))
}
if (-not [string]::Equals(
    [System.IO.Path]::GetDirectoryName($demoDir.TrimEnd('\')),
    $dataRoot,
    [System.StringComparison]::OrdinalIgnoreCase
)) {
    throw "重置只允许操作仓库 data 目录的直接子目录：$demoDir"
}

if (-not (Test-Path $demoDir)) {
    Write-Host '演示目录不存在，无需重置。'
    exit 0
}

$resolved = (Resolve-Path $demoDir).Path.TrimEnd('\')
if (-not [string]::Equals($resolved, $demoDir.TrimEnd('\'), [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "拒绝操作重解析点或路径别名：$resolved"
}

if (-not $Yes) {
    Write-Host "将删除：$resolved\smart_learning_demo.db* 与 $resolved\imported_sources"
    $answer = Read-Host '确认输入 YES 继续'
    if ($answer -ne 'YES') {
        Write-Host '已取消。'
        exit 1
    }
}

Get-ChildItem -LiteralPath $resolved -Filter 'smart_learning_demo.db*' -ErrorAction SilentlyContinue | Remove-Item -Force
$imported = Join-Path $resolved 'imported_sources'
if (Test-Path $imported) { Remove-Item -LiteralPath $imported -Recurse -Force }
$ocrCache = Join-Path $resolved 'source_ocr_cache'
if (Test-Path $ocrCache) { Remove-Item -LiteralPath $ocrCache -Recurse -Force }

Write-Host '演示数据已重置。下次启动演示环境会建立空数据库。'
