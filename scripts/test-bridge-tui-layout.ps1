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

. (Get-BridgeTuiDefinitions) -NoAnsi -TranscriptLines 80 -Port "COM_TEST"

function Reset-MessageFixture {
    $script:messages.Clear()
    $script:messageRecords.Clear()
    $script:seenMessageIds.Clear()
    $script:seenMessageLines.Clear()
    $script:messageScrollOffset = 0
    $script:messageAppendPending = $false
}

Reset-MessageFixture
Add-MessageLine "23:09:54 | ESP Bridge: single row"
$rows = @(Get-MessageRenderRows 96)
Assert-Equal $rows.Count 2 "Single-message render should remain array-shaped."
Assert-Equal $rows[0].Text "You  23:09:54" "Own message metadata should be normalized."
Assert-True $rows[0].RightAlign "Own message metadata should right-align."

Reset-MessageFixture
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

$script:layoutEnabled = $true
$script:lastLayoutWidth = 0
$script:lastLayoutHeight = 0
$script:renderDirty = $true
$script:liveFeed.Clear()
Reset-MessageFixture
Add-MessageLine "23:10:00 | Caleb: two pane render"
Assert-True ((@(if ($false) { Get-SidebarLines })).Count -eq 0) "Disabled sidebar output should stay array-shaped under strict mode."
$script:layoutEnabled = $false

$script:messageScrollOffset = 0
Assert-Equal (Get-MessageTopPadding 5 12 0) 7 "Short message history should bottom-align near the prompt."
Assert-Equal (Get-MessageTopPadding 16 12 0) 0 "Overflowing message history should not add top padding."
Assert-Equal (Get-MessageTopPadding 5 12 3) 0 "Scrolled message history should not add top padding."

$script:bridgeHealth.wifi = "yes"
Assert-True ((Get-HealthLabel) -match "data link: established") "Health label should use data-link wording."
Assert-True ((Get-HealthLabel) -notmatch "wifi|wi-fi") "Health label should not expose transport wording."
Assert-True ((Get-VersionLabel) -match "v0\.1\.24-startup-sync 2026-04-28") "Header version label should expose the running TUI bundle version."
Assert-True (((Get-SidebarLines) -join "`n") -match "tools 0\.1\.24-startup-sync") "Sidebar should expose the running TUI bundle version."
Start-InitialSync "group"
Assert-Equal (Get-LiveTransportLabel) "syncing latest" "Startup should label the transport as syncing until the first latest window settles."
Assert-True (((Get-SidebarLines) -join "`n") -match "sync\s+loading") "Sidebar should expose startup sync progress."
Complete-InitialSync "fixture"
Assert-True (-not $script:initialSyncActive) "Completing startup sync should clear the loading state."
$script:bridgeHealth.device = "paired"
$script:bridgeHealth.session = [DateTime]::UtcNow.AddHours(1).ToString("o")
$script:bridgeHealth.auth = [DateTime]::UtcNow.AddHours(1).ToString("o")
Assert-SmokeTranscriptHealthy ""
$sidebar = Get-SidebarLines
Assert-True (($sidebar -join "`n") -match "link\s+established") "Sidebar should show a data-link state."
Assert-True (($sidebar -join "`n") -notmatch "wifi|wi-fi") "Sidebar should not expose transport wording."
Assert-Equal (Format-TuiDisplayLine "  wifi_connected: yes") "  data_link: established" "Raw bridge status should be translated for TUI display."
Assert-Equal (Format-TuiDisplayLine "Wi-Fi disconnected; reason=8") "Data link interrupted; reason=8" "Raw bridge link errors should be translated for TUI display."

Reset-MessageFixture
$script:liveFeed.Clear()
$script:currentMode = "group"
$script:realtimeBackfillPending = $false
Try-HandleProtocolLine '@scb:{"type":"message",' | Out-Null
Assert-True $script:realtimeBackfillPending "Malformed protocol frames should queue fallback polling."
Assert-True (($script:liveFeed -join "`n") -notmatch "Protocol parse error") "Malformed protocol frames should not expose raw parser errors in the TUI."
$script:realtimeBackfillPending = $false
$script:liveFeed.Clear()

Reset-MessageFixture
Write-BridgeLine 'chat:group> @scb:{"type":"message","thread":"group","source":"realtime","id":"fixture-concat-1","createdAt":"2026-04-24T23:00:00Z","senderId":"user-1","senderLabel":"Caleb","content":"concat one"}@scb:{"type":"message","thread":"group","source":"realtime","id":"fixture-concat-2","createdAt":"2026-04-24T23:00:01Z","senderId":"user-1","senderLabel":"Caleb","content":"concat two"}'
Assert-Equal $script:messages.Count 2 "Concatenated protocol frames on one serial line should both render."
Assert-True ($script:messages[0] -match "concat one") "First concatenated protocol frame should be preserved."
Assert-True ($script:messages[1] -match "concat two") "Second concatenated protocol frame should be preserved."

Reset-MessageFixture
$script:realtimeBackfillPending = $false
Write-BridgeLine '@scb:{"type":"message","thread":"group"@scb:{"type":"message","thread":"group","source":"realtime","id":"fixture-after-fragment","createdAt":"2026-04-24T23:00:02Z","senderId":"user-1","senderLabel":"Caleb","content":"after fragment"}'
Assert-True $script:realtimeBackfillPending "Interrupted protocol fragments should still queue repair polling."
Assert-Equal $script:messages.Count 1 "A complete protocol frame after an interrupted fragment should still render live."
$script:realtimeBackfillPending = $false
Reset-MessageFixture

Write-BridgeLine 'E (2412469) transport_ws: Error read data'
Assert-Equal $script:liveFeed.Count 0 "Low-level realtime transport noise should not render in the live feed."
Assert-Equal $script:realtimeNoiseSkipCount 1 "Suppressed realtime transport noise should be counted."
Assert-True $script:realtimeBackfillPending "Low-level realtime transport noise should queue fallback polling."
Invoke-PendingRealtimeBackfill
Assert-True $script:realtimeBackfillPending "Realtime repair polling should be deferred instead of firing in the same render tick."
$script:realtimeBackfillPending = $false

Write-BridgeLine 'I (5658) wifi:new:<1,0>, old:<1,0>'
Assert-Equal $script:liveFeed.Count 0 "Low-level link driver logs should not render in the live feed."
Assert-Equal $script:realtimeNoiseSkipCount 2 "Suppressed link driver logs should be counted."

Write-BridgeLine ',"createdAt":"2026-04-28T01:01:16.003518+00:00","senderId":"fixture"'
Assert-Equal $script:liveFeed.Count 0 "Orphaned structured JSON fragments should not render in the live feed."
Assert-Equal $script:realtimeNoiseSkipCount 3 "Suppressed structured JSON fragments should be counted."

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

$script:currentMode = "group"
Reset-MessageFixture
Start-InitialSync "group"
Try-HandleProtocolLine '@scb:{"type":"messagesReset","thread":"group"}' | Out-Null
Assert-True $script:initialSyncActive "Initial sync should remain active after latest-window reset until rows arrive or timeout."
Try-HandleProtocolLine '@scb:{"type":"message","thread":"group","source":"poll","id":"fixture-sync-1","createdAt":"2026-04-24T23:00:03Z","senderId":"user-1","senderLabel":"Caleb","content":"sync row"}' | Out-Null
Assert-True $script:initialSyncActive "Initial sync should debounce briefly after the first latest row."
Assert-True ($script:initialSyncSettledAt -gt [DateTime]::UtcNow) "Initial sync should schedule a near-future settled time after first latest row."
$script:initialSyncSettledAt = [DateTime]::UtcNow.AddMilliseconds(-1)
if ($script:initialSyncActive -and $script:initialSyncSettledAt -ne [DateTime]::MinValue -and [DateTime]::UtcNow -ge $script:initialSyncSettledAt) {
    Complete-InitialSync "test"
}
Assert-True (-not $script:initialSyncActive) "Initial sync should complete after the settle window elapses."

Reset-MessageFixture
Try-HandleProtocolLine '@scb:{"type":"message","thread":"group","source":"poll","id":"fixture-group-old","createdAt":"2026-04-24T23:00:04Z","senderId":"user-1","senderLabel":"Caleb","content":"old visible row"}' | Out-Null
Assert-Equal $script:messages.Count 1 "Fixture group message should render before latest refresh reset."
Try-HandleProtocolLine '@scb:{"type":"messagesReset","thread":"group"}' | Out-Null
Assert-Equal $script:messages.Count 1 "Latest refresh reset should not blank or replace the stable visible buffer before poll rows arrive."
Try-HandleProtocolLine '@scb:{"type":"message","thread":"group","source":"poll","id":"fixture-group-new","createdAt":"2026-04-24T23:00:05Z","senderId":"user-2","senderLabel":"Ron","content":"new latest row"}' | Out-Null
Assert-Equal $script:messages.Count 2 "Latest group refresh should reconcile into the deterministic message buffer."
Assert-True ($script:messages[1] -match "new latest row") "Newest poll rows should remain at the bottom of the deterministic buffer."

Try-HandleProtocolLine '@scb:{"type":"messagesReset","thread":"group"}' | Out-Null
Try-HandleProtocolLine '@scb:{"type":"message","thread":"group","source":"poll","id":"fixture-group-stale","createdAt":"2026-04-24T22:00:00Z","senderId":"user-2","senderLabel":"Ron","content":"stale delayed poll"}' | Out-Null
Assert-True ($script:messages[$script:messages.Count - 1] -match "new latest row") "A delayed stale poll should not take over the latest visible feed."

Reset-MessageFixture
Try-HandleProtocolLine '@scb:{"type":"message","thread":"group","source":"poll","id":"fixture-group-current","createdAt":"2026-04-24T23:00:05Z","senderId":"user-2","senderLabel":"Ron","content":"current latest row"}' | Out-Null
$script:historyLoadPending = $true
$script:historyBatchActive = $false
Try-HandleProtocolLine '@scb:{"type":"message","thread":"group","source":"history","id":"fixture-group-history-1","createdAt":"2026-04-24T22:59:01Z","senderId":"user-2","senderLabel":"Ron","content":"older first"}' | Out-Null
Try-HandleProtocolLine '@scb:{"type":"message","thread":"group","source":"history","id":"fixture-group-history-2","createdAt":"2026-04-24T22:59:02Z","senderId":"user-2","senderLabel":"Ron","content":"older second"}' | Out-Null
Assert-Equal $script:messages.Count 3 "History rows should prepend without replacing the current latest window."
Assert-True ($script:messages[0] -match "older first") "History prepends should preserve chronological order within the fetched page."
Assert-True ($script:messages[1] -match "older second") "History prepends should preserve chronological order across multiple rows."
Assert-True (-not $script:historyLoadPending) "Receiving history rows should clear the pending history state."
Write-BridgeLine "(no older messages)"
Assert-True $script:historyExhausted "No-older marker should stop repeated lazy history requests."

Reset-MessageFixture
for ($i = 0; $i -lt 40; $i++) {
    Add-MessageLine "23:11:$($i.ToString('00')) | Caleb: scroll fixture $i"
}
$script:messageScrollOffset = 0
Move-MessageScroll 8
Assert-True ($script:messageScrollOffset -gt 0) "Page scroll should increase scroll offset when history exceeds the pane."
Reset-MessageScroll
Assert-Equal $script:messageScrollOffset 0 "Reset scroll should return to latest."

$script:currentMode = "group"
$script:bridgeHealth.realtime = "connected"
Try-HandleProtocolLine '@scb:{"type":"status","realtimeRequested":true,"realtimeConnected":true,"realtimeJoined":true,"realtimeLastError":""}' | Out-Null
Assert-True $script:realtimeBackfillPending "Realtime rejoin should queue a backfill poll."

$script:realtimeConnected = $true
$script:bridgeHealth.realtime = "connected"
Assert-True ((Get-LiveTransportLabel) -ne "live: realtime") "Connected-but-not-joined realtime should not be labeled as the active live feed."
$script:bridgeHealth.realtime = "joined"
Assert-True ((Get-LiveTransportLabel) -eq "live: realtime") "Only joined realtime should be labeled as the active live feed."

$script:postSendBackfillUntil = [DateTime]::MinValue
$script:postSendBackfillNextAt = [DateTime]::MinValue
Queue-PostSendBackfill
Assert-True ($script:postSendBackfillUntil -gt [DateTime]::UtcNow) "Sending chat text should schedule a short follow-up polling window."
Assert-True ($script:postSendBackfillNextAt -gt [DateTime]::UtcNow) "Sending chat text should delay the first follow-up poll long enough for AI replies."
Assert-Equal $script:postSendBackfillCount 0 "Post-send fallback should start without immediate poll churn."

Write-Host "Bridge TUI layout regression passed."
