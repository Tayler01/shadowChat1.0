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
$longMessage = (@("longmessage") * 36) -join " "
Add-MessageLine "23:09:55 | Caleb: $longMessage"
$longRows = @(Get-MessageRenderRows 52)
Assert-True ($longRows.Count -gt 8) "Long messages should wrap into visible rows instead of being dropped."
Assert-True (@($longRows | Where-Object { $_.Text -match "longmessage longmessage" }).Count -gt 0) "Wrapped rows should preserve long message content."
foreach ($row in $longRows) {
    Assert-True ((Fit-Text $row.Text 52).Length -eq 52) "Rendered message rows should fit the message pane width."
}

$script:liveFeed.Clear()
Add-LiveFeedLine ("status: " + ("side-pane-value-" * 20))
Assert-Equal (Fit-Text $script:liveFeed[0] 30).Length 30 "Side feed lines should be clipped to their pane width."

$script:inputBuffer = "abcdefghijklmnopqrstuvwxyz0123456789"
$compactInput = Get-InputLine 24
Assert-True ($compactInput -match "\.\.\.") "Long input should keep the current typing tail visible."
Assert-True ((Fit-Text $compactInput 24).Length -eq 24) "Input bar should fit the available terminal width."
$script:inputBuffer = ""

$script:bridgeHealth.wifi = "yes"
Assert-True ((Get-HealthLabel) -match "data link: established") "Health label should use data-link wording."
Assert-True ((Get-HealthLabel) -notmatch "wifi|wi-fi") "Health label should not expose transport wording."
$sidebar = Get-SidebarLines
Assert-True (($sidebar -join "`n") -match "link\s+established") "Sidebar should show a data-link state."
Assert-True (($sidebar -join "`n") -notmatch "wifi|wi-fi") "Sidebar should not expose transport wording."
Assert-Equal (Format-TuiDisplayLine "  wifi_connected: yes") "  data_link: established" "Raw bridge status should be translated for TUI display."
Assert-Equal (Format-TuiDisplayLine "Wi-Fi disconnected; reason=8") "Data link interrupted; reason=8" "Raw bridge link errors should be translated for TUI display."

$script:messages.Clear()
$script:liveFeed.Clear()
$script:currentMode = "group"
Try-HandleProtocolLine '@scb:{"type":"message","thread":"dm","source":"realtime","conversationId":"conv-inactive","id":"fixture-dm-1","createdAt":"2026-04-24T23:00:00Z","senderId":"user-1","senderLabel":"Caleb","content":"inactive dm"}' | Out-Null
Assert-Equal $script:messages.Count 0 "Inactive DM should not render in group pane."
Assert-Equal $script:unreadDmCount 1 "Inactive DM should increment unread DM count."
Assert-True ((Get-UnreadSummaryLabel) -match "dm 1") "Unread summary should include DM count."

$script:currentMode = "dm"
Clear-UnreadForThread "dm"
Try-HandleProtocolLine '@scb:{"type":"message","thread":"dm","source":"poll","conversationId":"conv-active","id":"fixture-dm-2","createdAt":"2026-04-24T23:00:01Z","senderId":"user-1","senderLabel":"Caleb","content":"active dm"}' | Out-Null
Assert-Equal $script:messages.Count 1 "Active DM should render in message pane."
Assert-Equal $script:unreadDmCount 0 "Active DM should not leave unread count."

Try-HandleProtocolLine '@scb:{"type":"message","thread":"dm","source":"realtime","conversationId":"conv-other","id":"fixture-dm-3","createdAt":"2026-04-24T23:00:02Z","senderId":"user-2","senderLabel":"Maya","content":"other dm"}' | Out-Null
Assert-Equal $script:messages.Count 1 "Realtime DM from another conversation should not render in active DM pane."
Assert-Equal $script:unreadDmCount 1 "Realtime DM from another conversation should increment unread DM count."

Try-HandleProtocolLine '@scb:{"type":"message","thread":"dm","source":"realtime","conversationId":"conv-active","id":"fixture-dm-4","createdAt":"2026-04-24T23:00:03Z","senderId":"user-1","senderLabel":"Caleb","content":"active realtime dm"}' | Out-Null
Assert-Equal $script:messages.Count 2 "Realtime DM for the active conversation should render in active DM pane."

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
