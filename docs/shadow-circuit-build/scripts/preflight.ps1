# Read-only system checks; writes only the report under this packet's evidence/.
# No installs, credential reads, execution-policy changes or network calls.
[CmdletBinding()]
param([string]$OutputPath = (Join-Path $PSScriptRoot '..\evidence\xps-preflight.json'))
$ErrorActionPreference = 'Stop'
$report = [ordered]@{
    schemaVersion = 1
    capturedAt = (Get-Date).ToUniversalTime().ToString('o')
    purpose = 'Tool discovery only; not game, Blender-export, device or release validation'
    tools = [ordered]@{}
    blenderCandidates = @()
    unityEditorVersions = @()
    repositoryRoot = $null
}
foreach ($name in @('git', 'node', 'npm', 'python', 'py')) {
    $cmd = Get-Command $name -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($cmd) {
        $version = 'NOT_QUERIED'
        # npm.ps1 may be blocked by local policy; prefer its existing .cmd launcher.
        $exe = $cmd.Source
        if ($name -eq 'npm') {
            $npmCmd = Get-Command npm.cmd -ErrorAction SilentlyContinue | Select-Object -First 1
            if ($npmCmd) { $exe = $npmCmd.Source }
        }
        try { $version = ((& $exe --version 2>&1) | Select-Object -First 2) -join ' ' }
        catch { $version = 'VERSION_QUERY_FAILED: inspect installed command manually' }
        $report.tools[$name] = @{ found = $true; path = $exe; version = $version }
    } else { $report.tools[$name] = @{ found = $false } }
}
$blenderOnPath = Get-Command blender -ErrorAction SilentlyContinue | Select-Object -First 1
if ($blenderOnPath) { $report.blenderCandidates += $blenderOnPath.Source }
$base = Join-Path $env:ProgramFiles 'Blender Foundation'
if (Test-Path $base) {
    foreach ($dir in Get-ChildItem -LiteralPath $base -Directory) {
        $candidate = Join-Path $dir.FullName 'blender.exe'
        if (Test-Path $candidate) { $report.blenderCandidates += $candidate }
    }
}
$report.blenderCandidates = @($report.blenderCandidates | Select-Object -Unique)
$unityBase = Join-Path $env:ProgramFiles 'Unity\Hub\Editor'
if (Test-Path $unityBase) {
    $report.unityEditorVersions = @(Get-ChildItem -LiteralPath $unityBase -Directory | Select-Object -ExpandProperty Name)
}
if ($report.tools['git'].found) {
    try {
        $root = & git rev-parse --show-toplevel 2>$null
        if ($LASTEXITCODE -eq 0) { $report.repositoryRoot = $root }
    } catch { }
}
$directory = Split-Path -Parent $OutputPath
if ($directory -and !(Test-Path $directory)) { New-Item -ItemType Directory -Path $directory -Force | Out-Null }
$report | ConvertTo-Json -Depth 7 | Set-Content -LiteralPath $OutputPath -Encoding UTF8
Write-Output "Preflight report: $OutputPath"
Write-Output 'Inspect versions against the current repository. Blender/Unity were discovered, not launched or certified.'
