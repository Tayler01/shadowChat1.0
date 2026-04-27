[CmdletBinding()]
param(
    [string]$Version = "0.1.13-two-pane-render-fix",
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
    @{ Source = "tools/bridge-tui/START-CHAT.CMD"; Destination = "tools/bridge-tui/START-CHAT.CMD" },
    @{ Source = "tools/bridge-tui/BRIDGE-TOOLS-HELP.txt"; Destination = "tools/bridge-tui/BRIDGE-TOOLS-HELP.txt" },
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
- tools/bridge-tui/START-CHAT.CMD
- tools/bridge-tui/BRIDGE-TOOLS-HELP.txt
- tools/bridge-tui/bridge-bundle-receive.ps1
- tools/bridge-bootstrap/START.CMD
- tools/bridge-bootstrap/SETUP.CMD
- tools/bridge-bootstrap/Receive-ShadowChatBridge.ps1
- firmware/esp-bridge/README.md
- docs/ESP_BRIDGE_OTA_AND_OFFLINE_SOFTWARE_PLAN.md

Run the chat TUI:

Double-click tools\bridge-tui\START-CHAT.CMD

Or run it manually with auto-detect:

powershell -NoProfile -ExecutionPolicy Bypass -File tools\bridge-tui\bridge-tui.ps1

Only specify -Port COMx if auto-detect cannot find the bridge.

Receive a newer approved bundle through the ESP:

powershell -NoProfile -ExecutionPolicy Bypass -File tools\bridge-tui\bridge-bundle-receive.ps1

The receiver only reconstructs artifacts selected by the ESP from ShadowChat update manifests.
"@

Set-Content -LiteralPath (Join-Path $stagingRoot "INSTALL.txt") -Value $installText -Encoding UTF8

if (Test-Path -LiteralPath $zipPath) {
    Remove-Item -LiteralPath $zipPath -Force
}

Add-Type -AssemblyName System.IO.Compression

$fixedTimestamp = [DateTimeOffset]::Parse("2026-04-26T00:00:00Z")
$resolvedStagingRoot = (Resolve-Path -LiteralPath $stagingRoot).Path.TrimEnd("\", "/")
$zipStream = [System.IO.File]::Open($zipPath, [System.IO.FileMode]::CreateNew, [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)
$archive = [System.IO.Compression.ZipArchive]::new($zipStream, [System.IO.Compression.ZipArchiveMode]::Create)

try {
    $files = Get-ChildItem -LiteralPath $stagingRoot -Recurse -File |
        Sort-Object { $_.FullName.Substring($resolvedStagingRoot.Length).TrimStart("\", "/") }

    foreach ($file in $files) {
        $fullName = (Resolve-Path -LiteralPath $file.FullName).Path
        $relativePath = $fullName.Substring($resolvedStagingRoot.Length).TrimStart("\", "/").Replace("\", "/")
        $entry = $archive.CreateEntry($relativePath, [System.IO.Compression.CompressionLevel]::Optimal)
        $entry.LastWriteTime = $fixedTimestamp

        $sourceStream = [System.IO.File]::OpenRead($fullName)
        try {
            $entryStream = $entry.Open()
            try {
                $sourceStream.CopyTo($entryStream)
            } finally {
                $entryStream.Dispose()
            }
        } finally {
            $sourceStream.Dispose()
        }
    }
} finally {
    $archive.Dispose()
    $zipStream.Dispose()
}

$hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $zipPath).Hash.ToLowerInvariant()
$size = (Get-Item -LiteralPath $zipPath).Length

[pscustomobject]@{
    version = $safeVersion
    path = $zipPath
    sha256 = $hash
    sizeBytes = $size
} | ConvertTo-Json
