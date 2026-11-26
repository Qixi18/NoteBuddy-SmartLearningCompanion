# 重置演示数据库：只允许操作 data/demo，绝不影响 data/smart_learning.db。
#
# 用法：
#   pwsh -File scripts/demo/reset-demo.ps1          # 交互确认
#   pwsh -File scripts/demo/reset-demo.ps1 -Yes     # 跳过确认（自动化用）
[CmdletBinding()]
param([switch]$Yes)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$demoDir = Join-Path $root 'data\demo'

if (-not (Test-Path $demoDir)) {
    Write-Host '演示目录不存在，无需重置。'
    exit 0
}

$resolved = (Resolve-Path $demoDir).Path.TrimEnd('\')
$expected = (Join-Path $root 'data\demo').TrimEnd('\')
if ($resolved -ne $expected -or -not $resolved.EndsWith('\data\demo')) {
    throw "拒绝操作非演示目录：$resolved"
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
