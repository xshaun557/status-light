# ============================================================
# 副屏状态灯 - 一键切换状态（Windows PowerShell）
#
# 用法：
#   powershell -File set-state.ps1 yellow   # 工作中（黄灯）
#   powershell -File set-state.ps1 green    # 完成（绿灯）
#   powershell -File set-state.ps1 red      # 需要人工介入（红灯）
#   powershell -File set-state.ps1 idle     # 待机（全暗）
#
# 前提：server.js 已在本地启动（默认 http://localhost:8765）
# ============================================================

param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("yellow", "green", "red", "idle")]
    [string]$state
)

$url = "http://localhost:8765/api/state?state=$state"

try {
    $result = Invoke-RestMethod -Uri $url -Method Get
    Write-Host "已切换状态为: $($result.state)"
} catch {
    Write-Host "切换失败: $_"
    exit 1
}
