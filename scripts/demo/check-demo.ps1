# 演示前自检：数据包、迁移与服务状态。
#
# 用法：pwsh -File scripts/demo/check-demo.ps1
[CmdletBinding()]
param([string]$DemoDataDir = 'data\demo')

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
$failed = $false

Write-Host '[1/3] 校验演示数据（字段、引用、质量口径与 manifest 一致）'
Push-Location $root
try {
    python scripts/demo/verify-demo-data.py
    if ($LASTEXITCODE -ne 0) { $failed = $true }
} finally { Pop-Location }

Write-Host '[2/3] 检查演示数据库迁移状态'
Push-Location (Join-Path $root 'apps\backend')
try {
    $env:PYTHONPATH = Join-Path $root 'apps\backend'
    $env:SMART_LEARNING_DATA_DIR = $demoDir
    $env:SMART_LEARNING_DATABASE_URL = 'sqlite:///' + ($dbPath -replace '\\', '/')
    $env:SMART_LEARNING_PORT = [string]$port
    $doctorOutput = python -m app.cli doctor
    $doctorExitCode = $LASTEXITCODE
    $doctor = ($doctorOutput -join "`n") | ConvertFrom-Json
    if ($doctor.database.status -eq 'current') {
        Write-Host "  数据库 schema 与代码 head $($doctor.database.head_revision) 一致。"
    } elseif ($doctor.database.status -eq 'migration_required') {
        Write-Host '  演示数据库尚未迁移或需要升级；start-demo.ps1 会在启动前升级。'
    } else {
        Write-Host "  数据库状态异常：$($doctor.database.status)"
        $failed = $true
    }
    if ($doctorExitCode -ne 0 -and $doctor.database.status -ne 'migration_required') {
        Write-Host '  doctor 检查未通过；请检查运行依赖或数据库配置。'
        $failed = $true
    }
} catch {
    Write-Host "  无法检查演示数据库：$($_.Exception.Message)"
    $failed = $true
} finally { Pop-Location }

Write-Host '[3/3] 检查服务是否在运行'
try {
    $health = Invoke-RestMethod -Uri "http://localhost:$port/api/health" -TimeoutSec 3
    Write-Host ("  服务在线：{0}" -f ($health | ConvertTo-Json -Compress))
} catch {
    Write-Host "  服务未启动：请先运行 pwsh -File scripts/demo/start-demo.ps1 -DemoDataDir $DemoDataDir"
}

if ($failed) {
    Write-Host '自检未通过：请先修复演示数据。'
    exit 1
}
Write-Host '自检通过。'
