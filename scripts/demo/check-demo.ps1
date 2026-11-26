# 演示前自检：数据包、迁移与服务状态。
#
# 用法：pwsh -File scripts/demo/check-demo.ps1
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$failed = $false

Write-Host '[1/3] 校验演示数据（字段、引用、质量口径与 manifest 一致）'
Push-Location $root
try {
    python scripts/demo/verify-demo-data.py
    if ($LASTEXITCODE -ne 0) { $failed = $true }
} finally { Pop-Location }

Write-Host '[2/3] 检查数据库迁移版本'
Push-Location (Join-Path $root 'apps\backend')
try {
    $env:PYTHONPATH = Join-Path $root 'apps\backend'
    $head = python -c "from alembic.config import Config; from alembic.script import ScriptDirectory; c=Config('alembic.ini'); i=ScriptDirectory.from_config(c); print(i.get_current_head())"
    Write-Host "  当前代码 head：$head"
} catch {
    Write-Host '  无法读取迁移 head（不影响演示，但请确认 alembic 可用）'
} finally { Pop-Location }

Write-Host '[3/3] 检查服务是否在运行'
try {
    $health = Invoke-RestMethod -Uri 'http://127.0.0.1:8765/api/health' -TimeoutSec 3
    Write-Host ("  服务在线：{0}" -f ($health | ConvertTo-Json -Compress))
} catch {
    Write-Host '  服务未启动：请先运行 pwsh -File scripts/demo/start-demo.ps1'
}

if ($failed) {
    Write-Host '自检未通过：请先修复演示数据。'
    exit 1
}
Write-Host '自检通过。'
