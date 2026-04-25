Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$tuiPath = Join-Path $repoRoot "tools\bridge-tui\bridge-tui.ps1"

function Get-BridgeTuiDefinitions {
    $raw = Get-Content -LiteralPath $tuiPath -Raw
    $entryIndex = $raw.LastIndexOf("try {")
    if ($entryIndex -lt 0) {
        throw "Could not find bridge TUI entrypoint."
    }

    return [scriptblock]::Create($raw.Substring(0, $entryIndex))
}

function Assert-Equal {
    param(
        [object]$Actual,
        [object]$Expected,
        [string]$Message
    )

    if ($Actual -ne $Expected) {
        throw "$Message Expected '$Expected', got '$Actual'."
    }
}

function Assert-True {
    param(
        [bool]$Condition,
        [string]$Message
    )

    if (-not $Condition) {
        throw $Message
    }
}

. (Get-BridgeTuiDefinitions) -NoAnsi -TranscriptLines 80

$script:messages.Clear()
Add-MessageLine "23:09:54 | ESP Bridge: single row"
$rows = @(Get-MessageRenderRows 96)
Assert-Equal $rows.Count 2 "Single-message render should remain array-shaped."
Assert-Equal $rows[0].Text "You  23:09:54" "Own message metadata should be normalized."
Assert-True $rows[0].RightAlign "Own message metadata should right-align."

$script:messages.Clear()
$script:liveFeed.Clear()
$script:currentMode = "group"
Try-HandleProtocolLine '@scb:{"type":"message","thread":"dm","id":"fixture-dm-1","createdAt":"2026-04-24T23:00:00Z","senderId":"user-1","senderLabel":"Caleb","content":"inactive dm"}' | Out-Null
Assert-Equal $script:messages.Count 0 "Inactive DM should not render in group pane."
Assert-Equal $script:unreadDmCount 1 "Inactive DM should increment unread DM count."
Assert-True ((Get-UnreadSummaryLabel) -match "dm 1") "Unread summary should include DM count."

$script:currentMode = "dm"
Clear-UnreadForThread "dm"
Try-HandleProtocolLine '@scb:{"type":"message","thread":"dm","id":"fixture-dm-2","createdAt":"2026-04-24T23:00:01Z","senderId":"user-1","senderLabel":"Caleb","content":"active dm"}' | Out-Null
Assert-Equal $script:messages.Count 1 "Active DM should render in message pane."
Assert-Equal $script:unreadDmCount 0 "Active DM should not leave unread count."

$script:messageScrollOffset = 0
Move-MessageScroll 8
Assert-Equal $script:messageScrollOffset 8 "Page scroll should increase scroll offset."
Reset-MessageScroll
Assert-Equal $script:messageScrollOffset 0 "Reset scroll should return to latest."

$script:currentMode = "group"
$script:bridgeHealth.realtime = "connected"
Try-HandleProtocolLine '@scb:{"type":"status","realtimeRequested":true,"realtimeConnected":true,"realtimeJoined":true,"realtimeLastError":""}' | Out-Null
Assert-True $script:realtimeBackfillPending "Realtime rejoin should queue a backfill poll."

Write-Host "Bridge TUI layout regression passed."
