# 启动演示环境：构建前端 + 用独立演示数据库启动后端，只开一个服务入口。
#
# 用法：
#   pwsh -File scripts/demo/start-demo.ps1            # 使用已有构建产物
#   pwsh -File scripts/demo/start-demo.ps1 -Rebuild   # 强制重新构建前端
[CmdletBinding()]
param(
    [switch]$Rebuild,
    [string]$DemoDataDir = 'data\demo'
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$dataRoot = [System.IO.Path]::GetFullPath((Join-Path $root 'data')).TrimEnd('\') + '\'
$demoDir = [System.IO.Path]::GetFullPath((Join-Path $root $DemoDataDir))
if (-not $demoDir.StartsWith($dataRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "演示数据库目录必须位于仓库 data 目录内：$demoDir"
}
$dbPath = Join-Path $demoDir 'smart_learning_demo.db'
$port = 8765
if ($env:SMART_LEARNING_PORT) {
    $parsedPort = 0
    if (-not [int]::TryParse($env:SMART_LEARNING_PORT, [ref]$parsedPort)) {
        throw 'SMART_LEARNING_PORT 必须是 1 到 65535 之间的整数'
    }
    $port = $parsedPort
}
if ($port -lt 1 -or $port -gt 65535) {
    throw 'SMART_LEARNING_PORT 必须是 1 到 65535 之间的整数'
}

if (-not (Test-Path (Join-Path $root 'demo-data\manifest.json'))) {
    throw "缺少 demo-data/manifest.json，请先运行 python scripts/demo/build-demo-data.py"
}
New-Item -ItemType Directory -Force -Path $demoDir | Out-Null

if ($Rebuild -or -not (Test-Path (Join-Path $root 'apps\web\dist\index.html'))) {
    Write-Host '正在构建前端（npm run web:build）…'
    Push-Location $root
    try { npm run web:build; if ($LASTEXITCODE -ne 0) { throw '前端构建失败' } }
    finally { Pop-Location }
}

$env:SMART_LEARNING_DATA_DIR = $demoDir
$env:SMART_LEARNING_DATABASE_URL = 'sqlite:///' + ($dbPath -replace '\\', '/')
$env:SMART_LEARNING_PORT = [string]$port
$env:PYTHONPATH = Join-Path $root 'apps\backend'

Write-Host '正在检查并升级演示数据库（python -m app.cli db-upgrade）…'
Push-Location (Join-Path $root 'apps\backend')
try {
    python -m app.cli db-upgrade
    if ($LASTEXITCODE -ne 0) { throw '演示数据库迁移失败' }
} finally { Pop-Location }

Write-Host ''
Write-Host '演示环境已就绪：'
Write-Host "  数据库：$dbPath"
Write-Host "  入口：  http://localhost:$port"
Write-Host '  数据：  demo-data/csv（六份 CSV，可在工作台一次导入）'
Write-Host '  重置：  pwsh -File scripts/demo/reset-demo.ps1'
Write-Host ''

Push-Location (Join-Path $root 'apps\backend')
try { python -m app.main } finally { Pop-Location }
