[CmdletBinding()]
param(
    [string]$Version = "0.1.3-tools",
    [string]$OutputDirectory = "output/bridge-bundles"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$fullOutputDirectory = if ([System.IO.Path]::IsPathRooted($OutputDirectory)) {
    $OutputDirectory
} else {
    Join-Path $repoRoot $OutputDirectory
}

$safeVersion = $Version -replace '[^A-Za-z0-9._-]', '-'
$stagingRoot = Join-Path $fullOutputDirectory "shadowchat-bridge-tools-$safeVersion"
$zipPath = Join-Path $fullOutputDirectory "shadowchat-bridge-tools-$safeVersion.zip"

if (Test-Path -LiteralPath $stagingRoot) {
    Remove-Item -LiteralPath $stagingRoot -Recurse -Force
}

New-Item -ItemType Directory -Force -Path $stagingRoot | Out-Null

$items = @(
    @{ Source = "tools/bridge-tui/bridge-tui.ps1"; Destination = "tools/bridge-tui/bridge-tui.ps1" },
    @{ Source = "tools/bridge-tui/bridge-bundle-receive.ps1"; Destination = "tools/bridge-tui/bridge-bundle-receive.ps1" },
    @{ Source = "tools/bridge-bootstrap/START.CMD"; Destination = "tools/bridge-bootstrap/START.CMD" },
    @{ Source = "tools/bridge-bootstrap/SETUP.CMD"; Destination = "tools/bridge-bootstrap/SETUP.CMD" },
    @{ Source = "tools/bridge-bootstrap/START-HERE.cmd"; Destination = "tools/bridge-bootstrap/START-HERE.cmd" },
    @{ Source = "tools/bridge-bootstrap/Receive-ShadowChatBridge.ps1"; Destination = "tools/bridge-bootstrap/Receive-ShadowChatBridge.ps1" },
    @{ Source = "tools/bridge-bootstrap/README.txt"; Destination = "tools/bridge-bootstrap/README.txt" },
    @{ Source = "firmware/esp-bridge/README.md"; Destination = "firmware/esp-bridge/README.md" },
    @{ Source = "docs/ESP_BRIDGE_OTA_AND_OFFLINE_SOFTWARE_PLAN.md"; Destination = "docs/ESP_BRIDGE_OTA_AND_OFFLINE_SOFTWARE_PLAN.md" }
)

foreach ($item in $items) {
    $source = Join-Path $repoRoot $item.Source
    if (-not (Test-Path -LiteralPath $source -PathType Leaf)) {
        throw "Required bundle file is missing: $($item.Source)"
    }

    $destination = Join-Path $stagingRoot $item.Destination
    $parent = Split-Path -Parent $destination
    if (-not [string]::IsNullOrWhiteSpace($parent)) {
        New-Item -ItemType Directory -Force -Path $parent | Out-Null
    }

    Copy-Item -LiteralPath $source -Destination $destination -Force
}

$installText = @"
ShadowChat Bridge Tools $safeVersion

This bundle is intended for a Windows PC that does not have direct internet access.

Included:
- tools/bridge-tui/bridge-tui.ps1
- tools/bridge-tui/bridge-bundle-receive.ps1
- tools/bridge-bootstrap/START.CMD
- tools/bridge-bootstrap/SETUP.CMD
- tools/bridge-bootstrap/Receive-ShadowChatBridge.ps1
- firmware/esp-bridge/README.md
- docs/ESP_BRIDGE_OTA_AND_OFFLINE_SOFTWARE_PLAN.md

Run the chat TUI:

powershell -NoProfile -ExecutionPolicy Bypass -File tools\bridge-tui\bridge-tui.ps1 -Port COM3

Receive a newer approved bundle through the ESP:

powershell -NoProfile -ExecutionPolicy Bypass -File tools\bridge-tui\bridge-bundle-receive.ps1 -Port COM3

The receiver only reconstructs artifacts selected by the ESP from ShadowChat update manifests.
"@

Set-Content -LiteralPath (Join-Path $stagingRoot "INSTALL.txt") -Value $installText -Encoding UTF8

if (Test-Path -LiteralPath $zipPath) {
    Remove-Item -LiteralPath $zipPath -Force
}

Compress-Archive -Path (Join-Path $stagingRoot "*") -DestinationPath $zipPath -CompressionLevel Optimal
$hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $zipPath).Hash.ToLowerInvariant()
$size = (Get-Item -LiteralPath $zipPath).Length

[pscustomobject]@{
    version = $safeVersion
    path = $zipPath
    sha256 = $hash
    sizeBytes = $size
} | ConvertTo-Json
