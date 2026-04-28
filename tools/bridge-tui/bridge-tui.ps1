[CmdletBinding()]
param(
    [string]$Port = "",
    [int]$BaudRate = 115200,
    [ValidateSet("group", "dm", "admin")]
    [string]$Mode = "group",
    [string]$DmRecipientUserId = "",
    [int]$PollSeconds = 6,
    [int]$StatusSeconds = 45,
    [switch]$NoProtocol,
    [switch]$NoAutoPoll,
    [switch]$Smoke,
    [switch]$NoAnsi,
    [switch]$SavePreferences,
    [switch]$ResetPreferences,
    [string]$PreferencesPath = "",
    [int]$TranscriptLines = 200,
    [string]$SmokeGroupText = "",
    [string]$SmokeDmRecipientUserId = "",
    [string]$SmokeDmText = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$script:utf8NoBom = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = $script:utf8NoBom
$OutputEncoding = $script:utf8NoBom
$script:tuiVersion = "0.1.20-fragment-filter"
$script:tuiVersionDate = "2026-04-28"

function Get-DefaultPreferencesPath {
    $root = if ($env:LOCALAPPDATA) {
        Join-Path $env:LOCALAPPDATA "ShadowChatBridge"
    } else {
        Join-Path $HOME ".shadowchat-bridge"
    }

    return Join-Path $root "bridge-tui.json"
}

function Read-BridgeTuiPreferences {
    param([string]$Path)

    if ([string]::IsNullOrWhiteSpace($Path) -or -not (Test-Path -LiteralPath $Path)) {
        return $null
    }

    try {
        return Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json
    } catch {
        Write-Warning "Ignoring unreadable bridge TUI preferences at $Path"
        return $null
    }
}

function Test-BridgePortCandidate {
    param(
        [string]$Name,
        [int]$Baud
    )

    if ([string]::IsNullOrWhiteSpace($Name)) {
        return $false
    }

    $probe = [System.IO.Ports.SerialPort]::new($Name, $Baud)
    $probe.Encoding = $script:utf8NoBom
    $probe.NewLine = "`n"
    $probe.ReadTimeout = 250
    $probe.WriteTimeout = 1000
    $probe.DtrEnable = $true
    $probe.RtsEnable = $true

    try {
        $probe.Open()
        Start-Sleep -Milliseconds 900
        $probe.DiscardInBuffer()
        $probe.WriteLine("/admin")
        Start-Sleep -Milliseconds 250
        $probe.WriteLine("bootstrap ping")

        $deadline = [DateTime]::UtcNow.AddSeconds(3)
        while ([DateTime]::UtcNow -lt $deadline) {
            try {
                if ($probe.ReadLine() -match "SHADOWCHAT_BRIDGE_READY") {
                    return $true
                }
            } catch [System.TimeoutException] {
            }
        }
    } catch {
        return $false
    } finally {
        if ($probe.IsOpen) {
            $probe.Close()
        }
        $probe.Dispose()
    }

    return $false
}

function Resolve-BridgePort {
    param(
        [string]$Requested,
        [int]$Baud,
        [bool]$Explicit
    )

    if ($Explicit -and -not [string]::IsNullOrWhiteSpace($Requested)) {
        return $Requested
    }

    if (-not [string]::IsNullOrWhiteSpace($Requested) -and (Test-BridgePortCandidate -Name $Requested -Baud $Baud)) {
        return $Requested
    }

    if (-not [string]::IsNullOrWhiteSpace($Requested)) {
        Write-Host "Saved bridge port $Requested did not answer. Auto-detecting..."
    } else {
        Write-Host "Auto-detecting ShadowChat bridge serial port..."
    }

    foreach ($candidate in ([System.IO.Ports.SerialPort]::GetPortNames() | Sort-Object)) {
        Write-Host "Checking $candidate..."
        if (Test-BridgePortCandidate -Name $candidate -Baud $Baud) {
            Write-Host "Using $candidate"
            return $candidate
        }
    }

    throw "Could not find the ShadowChat ESP bridge serial port. Close other serial tools, reconnect the ESP, or run with -Port COMx."
}

function Save-BridgeTuiPreferences {
    param([string]$Path)

    if ([string]::IsNullOrWhiteSpace($Path)) {
        return
    }

    $parent = Split-Path -Parent $Path
    if (-not [string]::IsNullOrWhiteSpace($parent)) {
        New-Item -ItemType Directory -Force -Path $parent | Out-Null
    }

    [pscustomobject]@{
        port = $Port
        baudRate = $BaudRate
        mode = $script:currentMode
        dmRecipientUserId = $script:dmRecipientUserId
        pollSeconds = $PollSeconds
        statusSeconds = $StatusSeconds
        noAutoPoll = -not $script:liveReceive
        protocolEnabled = [bool]$script:protocolEnabled
        transcriptLines = $script:transcriptLimit
        recentDms = @($script:recentDms)
        updatedAt = [DateTime]::UtcNow.ToString("o")
    } | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $Path -Encoding UTF8
}

function Save-BridgeTuiPreferencesQuiet {
    param([string]$Path)

    if ($Smoke) {
        return
    }

    try {
        Save-BridgeTuiPreferences -Path $Path
    } catch {
        Add-LiveFeedLine "Could not save preferences: $($_.Exception.Message)"
        Request-Render
    }
}

$script:preferencesPath = if ([string]::IsNullOrWhiteSpace($PreferencesPath)) {
    Get-DefaultPreferencesPath
} else {
    $PreferencesPath
}

if ($ResetPreferences -and (Test-Path -LiteralPath $script:preferencesPath)) {
    Remove-Item -LiteralPath $script:preferencesPath -Force
}

$loadedPreferences = if (-not $ResetPreferences) {
    Read-BridgeTuiPreferences -Path $script:preferencesPath
} else {
    $null
}

if ($loadedPreferences) {
    if (-not $PSBoundParameters.ContainsKey("Port") -and $loadedPreferences.port) {
        $Port = [string]$loadedPreferences.port
    }
    if (-not $PSBoundParameters.ContainsKey("BaudRate") -and $loadedPreferences.baudRate) {
        $BaudRate = [int]$loadedPreferences.baudRate
    }
    if (-not $PSBoundParameters.ContainsKey("Mode") -and $loadedPreferences.mode) {
        $Mode = [string]$loadedPreferences.mode
    }
    if (-not $PSBoundParameters.ContainsKey("DmRecipientUserId") -and $loadedPreferences.dmRecipientUserId) {
        $DmRecipientUserId = [string]$loadedPreferences.dmRecipientUserId
    }
    if (-not $PSBoundParameters.ContainsKey("PollSeconds") -and $loadedPreferences.pollSeconds) {
        $PollSeconds = [int]$loadedPreferences.pollSeconds
    }
    if (
        -not $PSBoundParameters.ContainsKey("StatusSeconds") -and
        ($loadedPreferences.PSObject.Properties.Name -contains "statusSeconds") -and
        $null -ne $loadedPreferences.statusSeconds
    ) {
        $StatusSeconds = [int]$loadedPreferences.statusSeconds
    }
    if (-not $PSBoundParameters.ContainsKey("NoAutoPoll") -and $loadedPreferences.noAutoPoll) {
        $NoAutoPoll = [bool]$loadedPreferences.noAutoPoll
    }
    if (
        -not $PSBoundParameters.ContainsKey("NoProtocol") -and
        ($loadedPreferences.PSObject.Properties.Name -contains "protocolEnabled") -and
        $null -ne $loadedPreferences.protocolEnabled
    ) {
        $NoProtocol = -not [bool]$loadedPreferences.protocolEnabled
    }
    if (-not $PSBoundParameters.ContainsKey("TranscriptLines") -and $loadedPreferences.transcriptLines) {
        $TranscriptLines = [int]$loadedPreferences.transcriptLines
    }
}

$Port = Resolve-BridgePort -Requested $Port -Baud $BaudRate -Explicit:$PSBoundParameters.ContainsKey("Port")

$script:serial = $null
$script:incomingBuffer = ""
$script:currentMode = $Mode
$script:dmRecipientUserId = $DmRecipientUserId
$script:lastPollAt = [DateTime]::MinValue
$script:lastStatusAt = [DateTime]::MinValue
$script:running = $true
$script:inputBuffer = ""
$script:transcript = New-Object System.Collections.Generic.List[string]
$script:messages = New-Object System.Collections.Generic.List[string]
$script:liveFeed = New-Object System.Collections.Generic.List[string]
$script:recentDms = New-Object System.Collections.Generic.List[string]
$script:transcriptLimit = [Math]::Max(40, $TranscriptLines)
$script:liveFeedLimit = [Math]::Max(40, [Math]::Min(160, $TranscriptLines))
$script:layoutEnabled = $false
$script:renderDirty = $true
$script:lastRenderAt = [DateTime]::MinValue
$script:lastLayoutWidth = 0
$script:lastLayoutHeight = 0
$script:messageScrollOffset = 0
$script:lastRxAt = $null
$script:lastStatus = "starting"
$script:protocolEnabled = -not $NoProtocol
$script:liveReceive = -not $NoAutoPoll
$script:realtimeConnected = $false
$script:realtimeBackfillPending = $false
$script:lastSentAt = $null
$script:postSendBackfillUntil = [DateTime]::MinValue
$script:postSendBackfillNextAt = [DateTime]::MinValue
$script:protocolFrameSkipCount = 0
$script:realtimeNoiseSkipCount = 0
$script:unreadGroupCount = 0
$script:unreadDmCount = 0
$script:activeDmConversationId = ""
$script:seenMessageLines = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
$script:seenMessageIds = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
$script:pollMarkerPending = $false
$script:quietStatusPending = $false
$script:statusCaptureActive = $false
$script:statusCaptureQuiet = $false
$script:lastLiveStatusLine = ""
$script:lastLiveFeedLineSuppressed = $false
$script:bridgeHealth = [ordered]@{
    wifi = "unknown"
    device = "unknown"
    session = "unknown"
    auth = "unknown"
    serial = "unknown"
    realtime = "unknown"
    realtimeError = ""
}
$script:lastRealtimeState = $script:bridgeHealth.realtime

if ($loadedPreferences -and ($loadedPreferences.PSObject.Properties.Name -contains "recentDms") -and $loadedPreferences.recentDms) {
    foreach ($recentDm in @($loadedPreferences.recentDms)) {
        $value = [string]$recentDm
        if (-not [string]::IsNullOrWhiteSpace($value) -and -not $script:recentDms.Contains($value)) {
            $script:recentDms.Add($value) | Out-Null
        }
    }
}

if (-not [string]::IsNullOrWhiteSpace($script:dmRecipientUserId) -and -not $script:recentDms.Contains($script:dmRecipientUserId)) {
    $script:recentDms.Add($script:dmRecipientUserId) | Out-Null
}

function Use-Color {
    return -not $NoAnsi -and -not [Console]::IsOutputRedirected
}

function Write-Ui {
    param(
        [string]$Text,
        [ConsoleColor]$Color = [ConsoleColor]::Gray,
        [switch]$NoNewline
    )

    $previous = [Console]::ForegroundColor
    $previousBackground = [Console]::BackgroundColor
    if (Use-Color) {
        [Console]::ForegroundColor = $Color
        [Console]::BackgroundColor = [ConsoleColor]::Black
    }

    if ($NoNewline) {
        Write-Host -NoNewline $Text
    } else {
        Write-Host $Text
    }

    if (Use-Color) {
        [Console]::ForegroundColor = $previous
        [Console]::BackgroundColor = $previousBackground
    }
}

function Remove-Ansi {
    param([string]$Text)
    $escape = [string][char]27
    return [regex]::Replace($Text, "$escape\[[0-9;?]*[ -/]*[@-~]", "")
}

function Get-DisplayText {
    param([string]$Text)

    if ($null -eq $Text) {
        return ""
    }

    $clean = Remove-Ansi $Text
    $clean = $clean -replace "[`r`n]+", " "
    $clean = $clean -replace "`t", " "
    return [regex]::Replace($clean, "[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]", "")
}

function Redact-SecretText {
    param([string]$Text)
    $redacted = [regex]::Replace($Text, '"accessToken"\s*:\s*"[^"]+"', '"accessToken":"(redacted)"')
    return [regex]::Replace($redacted, '"refreshToken"\s*:\s*"[^"]+"', '"refreshToken":"(redacted)"')
}

function Normalize-BridgeLine {
    param([string]$Line)

    $clean = Remove-Ansi (Redact-SecretText $Line)
    $clean = $clean.Trim("`r", "`n")
    $clean = [regex]::Replace($clean, "^(bridge>|chat:group>|chat:dm>)\s*", "")
    return $clean.TrimEnd()
}

function Get-LineColor {
    param([string]$Line)

    if ($Line -match "^(?:DM \| )?(?:\d{4}-\d{2}-\d{2}T.*|\d{2}:\d{2}:\d{2}|\(unknown time\)) \| ([^:]+): (.*)$") {
        $sender = $Matches[1]
        if (Test-OwnBridgeMessageSender $sender) {
            return [ConsoleColor]::Cyan
        }

        return [ConsoleColor]::Green
    }

    if ($Line -match "^(sent group message|sent message|sent dm|push delivered)") {
        return [ConsoleColor]::Cyan
    }

    if ($Line -match "(failed|error|too long|Unknown command|timed out)") {
        return [ConsoleColor]::Red
    }

    if ($Line -match "^(Entered|Returned|ShadowChat|Bridge status|\(no messages\)|Saved|Preferences)") {
        return [ConsoleColor]::Yellow
    }

    if ($Line -match "^-+ new messages -+$") {
        return [ConsoleColor]::Magenta
    }

    if ($Line -match "^\s{2}[a-zA-Z_]+:") {
        return [ConsoleColor]::DarkGray
    }

    return [ConsoleColor]::Gray
}

function Add-TranscriptLine {
    param([string]$Line)

    $script:transcript.Add($Line) | Out-Null
    while ($script:transcript.Count -gt $script:transcriptLimit) {
        $script:transcript.RemoveAt(0)
    }
}

function Add-MessageLine {
    param([string]$Line)

    Add-TranscriptLine $Line
    $script:messages.Add($Line) | Out-Null
    while ($script:messages.Count -gt $script:transcriptLimit) {
        $script:messages.RemoveAt(0)
    }
}

function Reset-MessageScroll {
    if ($script:messageScrollOffset -ne 0) {
        $script:messageScrollOffset = 0
        Request-Render
    }
}

function Get-MessagePageSize {
    return [Math]::Max(4, [Console]::WindowHeight - 6)
}

function Move-MessageScroll {
    param([int]$Delta)

    $script:messageScrollOffset = [Math]::Max(0, $script:messageScrollOffset + $Delta)
    Request-Render
}

function Move-MessageScrollTop {
    $script:messageScrollOffset = [int]::MaxValue
    Request-Render
}

function Clear-MessagePane {
    $script:messages.Clear()
    $script:seenMessageLines.Clear()
    $script:seenMessageIds.Clear()
    $script:pollMarkerPending = $false
    $script:messageScrollOffset = 0
}

function Add-LiveFeedLine {
    param([string]$Line)

    Add-TranscriptLine $Line
    if (Test-SuppressLiveFeedLine $Line) {
        $script:lastLiveFeedLineSuppressed = $true
        return
    }

    $script:lastLiveFeedLineSuppressed = $false
    $script:liveFeed.Add($Line) | Out-Null
    while ($script:liveFeed.Count -gt $script:liveFeedLimit) {
        $script:liveFeed.RemoveAt(0)
    }
}

function Test-SuppressLiveFeedLine {
    param([string]$Line)

    if ($Line -match "^[IWDVE] \(\d+\) (esp-x509-crt-bundle|websocket_client|HTTP_CLIENT|wifi|esp_netif|phy_init|event):") {
        return $true
    }

    if (Test-NoisyRealtimeLine $Line) {
        return $true
    }

    if ($Line -like "status: *") {
        if ($Line -eq $script:lastLiveStatusLine) {
            return $true
        }

        $script:lastLiveStatusLine = $Line
    }

    return $false
}

function Get-DataLinkLabel {
    param([string]$Value)

    $normalized = if ($Value) { $Value.Trim().ToLowerInvariant() } else { "" }
    if ($normalized -in @("yes", "true", "connected", "online", "up", "established")) {
        return "established"
    }

    if ($normalized -in @("no", "false", "disconnected", "offline", "down")) {
        return "offline"
    }

    if ([string]::IsNullOrWhiteSpace($normalized) -or $normalized -eq "unknown") {
        return "seeking"
    }

    return $Value
}

function Format-TuiDisplayLine {
    param([string]$Line)

    if ($Line -match "^\s{2}wifi_connected:\s*(.+)$") {
        return "  data_link: $(Get-DataLinkLabel $Matches[1])"
    }

    if ($Line -match "^\s{2}wifi_ssid:\s*(.*)$") {
        $profile = if ([string]::IsNullOrWhiteSpace($Matches[1]) -or $Matches[1] -eq "(none)") { "(none)" } else { "configured" }
        return "  link_profile: $profile"
    }

    if ($Line -match "^Wi-Fi disconnected;\s*(.*)$") {
        $detail = $Matches[1].Trim()
        if ($detail) {
            return "Data link interrupted; $detail"
        }
        return "Data link interrupted"
    }

    if ($Line -match "^Wi-Fi is disconnected;\s*(.*)$") {
        $detail = $Matches[1].Trim()
        if ($detail) {
            return "Data link is offline; $detail"
        }
        return "Data link is offline"
    }

    if ($Line -match "^Connecting to Wi-Fi") {
        return "Establishing data link..."
    }

    if ($Line -match "^Wi-Fi connected") {
        return "Data link established"
    }

    return $Line
}

function Add-RecentDm {
    param([string]$Recipient)

    if ([string]::IsNullOrWhiteSpace($Recipient)) {
        return
    }

    $normalized = $Recipient.Trim()
    for ($i = $script:recentDms.Count - 1; $i -ge 0; $i--) {
        if ([string]::Equals($script:recentDms[$i], $normalized, [StringComparison]::OrdinalIgnoreCase)) {
            $script:recentDms.RemoveAt($i)
        }
    }

    $script:recentDms.Insert(0, $normalized)
    while ($script:recentDms.Count -gt 8) {
        $script:recentDms.RemoveAt($script:recentDms.Count - 1)
    }
}

function Show-RecentDms {
    if ($script:recentDms.Count -eq 0) {
        Add-LiveFeedLine "Recent DMs: none yet"
    } else {
        Add-LiveFeedLine "Recent DMs"
        for ($i = 0; $i -lt $script:recentDms.Count; $i++) {
            Add-LiveFeedLine "  $($i + 1). $($script:recentDms[$i])"
        }
    }

    Request-Render
}

function Clear-UnreadForThread {
    param([string]$Thread)

    if ($Thread -eq "group") {
        $script:unreadGroupCount = 0
    } elseif ($Thread -eq "dm") {
        $script:unreadDmCount = 0
    }
}

function Get-UnreadSummaryLabel {
    $parts = New-Object System.Collections.Generic.List[string]
    if ($script:unreadGroupCount -gt 0) {
        $parts.Add("group $script:unreadGroupCount") | Out-Null
    }
    if ($script:unreadDmCount -gt 0) {
        $parts.Add("dm $script:unreadDmCount") | Out-Null
    }

    if ($parts.Count -eq 0) {
        return ""
    }

    return " | unread: $($parts -join " ")"
}

function Get-UnreadSidebarLabel {
    if ($script:unreadGroupCount -eq 0 -and $script:unreadDmCount -eq 0) {
        return "none"
    }

    return "G:$script:unreadGroupCount D:$script:unreadDmCount"
}

function Test-MessageThreadActive {
    param(
        [string]$Thread,
        [string]$ConversationId = ""
    )

    if ($Thread -eq "group") {
        return $script:currentMode -eq "group"
    }

    if ($Thread -eq "dm") {
        if ($script:currentMode -ne "dm") {
            return $false
        }

        if ([string]::IsNullOrWhiteSpace($ConversationId) -or [string]::IsNullOrWhiteSpace($script:activeDmConversationId)) {
            return $false
        }

        return [string]::Equals($script:activeDmConversationId, $ConversationId, [StringComparison]::OrdinalIgnoreCase)
    }

    return $true
}

function Register-InactiveUnread {
    param(
        [string]$Thread,
        [string]$Sender,
        [string]$ConversationId = ""
    )

    if (Test-OwnBridgeMessageSender $Sender) {
        return $false
    }

    if (Test-MessageThreadActive $Thread $ConversationId) {
        return $false
    }

    $senderLabel = if ([string]::IsNullOrWhiteSpace($Sender)) { "unknown" } else { $Sender }
    if ($Thread -eq "group") {
        $script:unreadGroupCount += 1
        Add-LiveFeedLine "Unread group message from $senderLabel"
        return $true
    }

    if ($Thread -eq "dm") {
        $script:unreadDmCount += 1
        Add-LiveFeedLine "Unread DM from $senderLabel"
        return $true
    }

    return $false
}

function Switch-NextConversation {
    if ($script:currentMode -eq "group" -and $script:recentDms.Count -gt 0) {
        Enter-BridgeMode "dm" $script:recentDms[0]
        return
    }

    if ($script:currentMode -eq "dm" -and $script:recentDms.Count -gt 1) {
        $currentIndex = -1
        for ($i = 0; $i -lt $script:recentDms.Count; $i++) {
            if ([string]::Equals($script:recentDms[$i], $script:dmRecipientUserId, [StringComparison]::OrdinalIgnoreCase)) {
                $currentIndex = $i
                break
            }
        }

        if ($currentIndex -ge 0 -and $currentIndex -lt ($script:recentDms.Count - 1)) {
            Enter-BridgeMode "dm" $script:recentDms[$currentIndex + 1]
            return
        }
    }

    Enter-BridgeMode "group"
}

function Test-BridgeMessageLine {
    param([string]$Line)

    return $Line -match "^(?:DM \| )?(?:\d{4}-\d{2}-\d{2}T.*|\d{2}:\d{2}:\d{2}|\(unknown time\)) \| [^:]+: .+"
}

function Get-BridgeMessageParts {
    param([string]$Line)

    if ($Line -match "^(?<dm>DM \| )?(?<time>\d{4}-\d{2}-\d{2}T.*|\d{2}:\d{2}:\d{2}|\(unknown time\)) \| (?<sender>[^:]+): (?<content>.*)$") {
        $isDm = $Matches.ContainsKey("dm") -and -not [string]::IsNullOrEmpty($Matches["dm"])
        return [pscustomobject]@{
            Time = $Matches["time"]
            Sender = $Matches["sender"]
            Content = $Matches["content"]
            IsDm = $isDm
        }
    }

    return $null
}

function Test-OwnBridgeMessageSender {
    param([string]$Sender)

    if ([string]::IsNullOrWhiteSpace($Sender)) {
        return $false
    }

    return $Sender -match "^(ESP Bridge|bridge|esp_)" -or $Sender -match "ABF584"
}

function Test-OwnBridgeMessageLine {
    param([string]$Line)

    $parts = Get-BridgeMessageParts $Line
    return $parts -and (Test-OwnBridgeMessageSender $parts.Sender)
}

function Format-MessagePaneLine {
    param(
        [string]$Line,
        [int]$Width
    )

    if ($Width -le 0) {
        return ""
    }

    $clean = Get-DisplayText $Line
    if ($clean.Length -gt $Width) {
        if ($Width -le 3) {
            $clean = $clean.Substring(0, $Width)
        } else {
            $clean = $clean.Substring(0, $Width - 3) + "..."
        }
    }

    if (Test-OwnBridgeMessageLine $Line) {
        return $clean.PadLeft($Width)
    }

    return $clean.PadRight($Width)
}

function Split-TextForWidth {
    param(
        [string]$Text,
        [int]$Width
    )

    if ($Width -le 0) {
        return @("")
    }

    $remaining = (Get-DisplayText $Text).Trim()
    if ([string]::IsNullOrEmpty($remaining)) {
        return @("")
    }

    $lines = New-Object System.Collections.Generic.List[string]
    while ($remaining.Length -gt $Width) {
        $breakAt = $remaining.LastIndexOf(" ", [Math]::Min($Width, $remaining.Length - 1))
        if ($breakAt -lt 1) {
            $breakAt = $Width
        }

        $lines.Add($remaining.Substring(0, $breakAt).TrimEnd()) | Out-Null
        $remaining = $remaining.Substring($breakAt).TrimStart()
    }

    if ($remaining.Length -gt 0) {
        $lines.Add($remaining) | Out-Null
    }

    return $lines.ToArray()
}

function New-MessageRenderRow {
    param(
        [string]$Text,
        [ConsoleColor]$Color,
        [bool]$RightAlign = $false
    )

    return [pscustomobject]@{
        Text = $Text
        Color = $Color
        RightAlign = $RightAlign
    }
}

function Get-MessageRenderRows {
    param([int]$Width)

    $rows = New-Object System.Collections.Generic.List[object]
    $contentWidth = [Math]::Max(8, [Math]::Min([Math]::Max(8, $Width - 4), 72))

    foreach ($message in $script:messages) {
        $parts = Get-BridgeMessageParts $message
        if (-not $parts) {
            $rows.Add((New-MessageRenderRow -Text $message -Color (Get-LineColor $message) -RightAlign $false)) | Out-Null
            continue
        }

        $ownMessage = Test-OwnBridgeMessageSender $parts.Sender
        $color = if ($ownMessage) { [ConsoleColor]::Cyan } else { [ConsoleColor]::Green }
        $threadLabel = if ($parts.IsDm) { "DM | " } else { "" }
        $sender = $parts.Sender
        if ($ownMessage) {
            $sender = "You"
        }

        $meta = "$threadLabel$sender  $($parts.Time)"
        $rows.Add((New-MessageRenderRow -Text $meta -Color ([ConsoleColor]::DarkGray) -RightAlign $ownMessage)) | Out-Null

        foreach ($line in @(Split-TextForWidth $parts.Content $contentWidth)) {
            $rows.Add((New-MessageRenderRow -Text $line -Color $color -RightAlign $ownMessage)) | Out-Null
        }

        $rows.Add((New-MessageRenderRow -Text "" -Color ([ConsoleColor]::DarkGray) -RightAlign $false)) | Out-Null
    }

    if ($rows.Count -gt 0 -and [string]::IsNullOrEmpty($rows[$rows.Count - 1].Text)) {
        $rows.RemoveAt($rows.Count - 1)
    }

    return $rows.ToArray()
}

function Get-MessageTopPadding {
    param(
        [int]$RowCount,
        [int]$BodyHeight,
        [int]$ScrollOffset
    )

    if ($ScrollOffset -gt 0) {
        return 0
    }

    return [Math]::Max(0, $BodyHeight - $RowCount)
}

function Write-MessageRenderRow {
    param(
        [object]$Row,
        [int]$Width,
        [switch]$NoNewline
    )

    if (-not $Row) {
        Write-FitSegment "" $Width ([ConsoleColor]::Gray) -NoNewline:$NoNewline
        return
    }

    $text = Fit-Text $Row.Text $Width
    if ($Row.RightAlign) {
        $clean = Get-DisplayText $Row.Text
        if ($clean.Length -lt $Width) {
            $text = (" " * ($Width - $clean.Length)) + $clean
        }
    }

    Write-Ui $text $Row.Color -NoNewline:$NoNewline
}

function Update-BridgeHealthFromStatusLine {
    param([string]$Line)

    if ($Line -match "^\s{2}wifi_connected:\s*(.+)$") {
        $script:bridgeHealth.wifi = $Matches[1].Trim()
    } elseif ($Line -match "^\s{2}device_status:\s*(.+)$") {
        $script:bridgeHealth.device = $Matches[1].Trim()
    } elseif ($Line -match "^\s{2}session_expires_at:\s*(.+)$") {
        $script:bridgeHealth.session = $Matches[1].Trim()
    } elseif ($Line -match "^\s{2}auth_expires_at:\s*(.+)$") {
        $script:bridgeHealth.auth = $Matches[1].Trim()
    }
}

function Get-ProtocolString {
    param(
        [object]$Event,
        [string]$Name,
        [string]$Fallback = ""
    )

    if ($Event -and ($Event.PSObject.Properties.Name -contains $Name) -and $null -ne $Event.$Name) {
        return [string]$Event.$Name
    }

    return $Fallback
}

function Queue-RealtimeBackfill {
    param([string]$Reason)

    if ($script:currentMode -ne "group" -and $script:currentMode -ne "dm") {
        return
    }

    $script:realtimeBackfillPending = $true
    if (-not [string]::IsNullOrWhiteSpace($Reason)) {
        Add-LiveFeedLine $Reason
    }
}

function Update-RealtimeTransition {
    param(
        [string]$Previous,
        [string]$Next,
        [string]$ErrorMessage = ""
    )

    if ($Previous -eq $Next) {
        return
    }

    if ($Next -eq "joined") {
        if ($Previous -in @("connected", "connecting", "off", "expired")) {
            Queue-RealtimeBackfill "Realtime rejoined; backfilling current thread."
        } elseif ($Previous -ne "unknown") {
            Add-LiveFeedLine "Realtime joined."
        }
    } elseif ($Previous -eq "joined" -and $Next -ne "joined") {
        $detail = if ([string]::IsNullOrWhiteSpace($ErrorMessage)) { "" } else { " ($ErrorMessage)" }
        Add-LiveFeedLine "Realtime interrupted$detail; fallback polling is active."
    } elseif ($Next -eq "connecting") {
        Add-LiveFeedLine "Realtime connecting..."
    }
}

function Invoke-PendingRealtimeBackfill {
    if (-not $script:realtimeBackfillPending) {
        return
    }

    if ($script:currentMode -ne "group" -and $script:currentMode -ne "dm") {
        return
    }

    $script:realtimeBackfillPending = $false
    Add-LiveFeedLine "Backfill polling $(Get-ModeLabel)."
    Invoke-Poll
}

function Queue-PostSendBackfill {
    if ($script:currentMode -ne "group" -and $script:currentMode -ne "dm") {
        return
    }

    $now = [DateTime]::UtcNow
    $script:postSendBackfillUntil = $now.AddSeconds(24)
    $script:postSendBackfillNextAt = $now.AddSeconds(2)
}

function Invoke-PostSendBackfill {
    if ($script:postSendBackfillUntil -eq [DateTime]::MinValue) {
        return
    }

    if ($script:currentMode -ne "group" -and $script:currentMode -ne "dm") {
        $script:postSendBackfillUntil = [DateTime]::MinValue
        return
    }

    $now = [DateTime]::UtcNow
    if ($now -gt $script:postSendBackfillUntil) {
        $script:postSendBackfillUntil = [DateTime]::MinValue
        return
    }

    if ($now -lt $script:postSendBackfillNextAt) {
        return
    }

    Invoke-Poll
    $script:postSendBackfillNextAt = $now.AddSeconds(5)
}

function Format-ProtocolMessageLine {
    param([object]$Event)

    $createdAt = Get-ProtocolString $Event "createdAt" "(unknown time)"
    $timeLabel = $createdAt
    if ($createdAt -match "^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}") {
        $timeLabel = $createdAt.Substring(11, 8)
    }

    $sender = Get-ProtocolString $Event "senderLabel" (Get-ProtocolString $Event "senderId" "unknown")
    $content = Get-ProtocolString $Event "content" ""
    $thread = Get-ProtocolString $Event "thread" "message"
    $prefix = if ($thread -eq "dm") { "DM | " } else { "" }
    return "${prefix}$timeLabel | ${sender}: $content"
}

function Update-BridgeHealthFromProtocol {
    param([object]$Event)

    $previousRealtime = $script:bridgeHealth.realtime
    $wifiConnected = $null
    if ($Event.PSObject.Properties.Name -contains "wifiConnected") {
        $wifiConnected = [bool]$Event.wifiConnected
    }

    if ($null -ne $wifiConnected) {
        $script:bridgeHealth.wifi = if ($wifiConnected) { "yes" } else { "no" }
    }

    $deviceStatus = Get-ProtocolString $Event "deviceStatus"
    if ($deviceStatus) {
        $script:bridgeHealth.device = $deviceStatus
    }

    $sessionExpiresAt = Get-ProtocolString $Event "sessionExpiresAt"
    if ($sessionExpiresAt) {
        $script:bridgeHealth.session = $sessionExpiresAt
    }

    $authExpiresAt = Get-ProtocolString $Event "authExpiresAt"
    if ($authExpiresAt) {
        $script:bridgeHealth.auth = $authExpiresAt
    }

    if ($Event.PSObject.Properties.Name -contains "realtimeConnected") {
        $script:realtimeConnected = [bool]$Event.realtimeConnected
    }

    if ($Event.PSObject.Properties.Name -contains "realtimeJoined") {
        $joined = [bool]$Event.realtimeJoined
        $requested = $false
        if ($Event.PSObject.Properties.Name -contains "realtimeRequested") {
            $requested = [bool]$Event.realtimeRequested
        }

        $script:bridgeHealth.realtime = if ($script:realtimeConnected -and $joined) {
            "joined"
        } elseif ($script:realtimeConnected) {
            "connected"
        } elseif ($requested) {
            "connecting"
        } else {
            "off"
        }
    }

    $realtimeError = Get-ProtocolString $Event "realtimeLastError"
    $script:bridgeHealth.realtimeError = if ($realtimeError) { $realtimeError } else { "" }
    $script:bridgeHealth.serial = "protocol"

    Update-RealtimeTransition $previousRealtime $script:bridgeHealth.realtime $script:bridgeHealth.realtimeError
    $script:lastRealtimeState = $script:bridgeHealth.realtime
}

function Try-HandleProtocolLine {
    param([string]$Line)

    if ($Line -notlike "@scb:*") {
        return $false
    }

    $payload = $Line.Substring(5)
    try {
        $event = $payload | ConvertFrom-Json
    } catch {
        $script:protocolFrameSkipCount += 1
        Queue-RealtimeBackfill
        Request-Render
        return $true
    }

    $type = Get-ProtocolString $event "type"
    if ($type -eq "status") {
        Update-BridgeHealthFromProtocol $event
        Add-LiveFeedLine "status: $(Get-HealthLabel)"
        Request-Render
        return $true
    }

    if ($type -eq "mode") {
        $mode = Get-ProtocolString $event "mode"
        if ($mode -in @("group", "dm", "admin")) {
            $script:bridgeHealth.serial = "protocol"
            Add-LiveFeedLine "mode: $mode"
        }
        Request-Render
        return $true
    }

    if ($type -eq "messagesReset") {
        $thread = Get-ProtocolString $event "thread" "message"
        $conversationId = Get-ProtocolString $event "conversationId"
        $shouldReset = $false
        if ($thread -eq "group" -and $script:currentMode -eq "group") {
            $shouldReset = $true
        } elseif ($thread -eq "dm" -and $script:currentMode -eq "dm") {
            $shouldReset = [string]::IsNullOrWhiteSpace($conversationId) -or
                [string]::IsNullOrWhiteSpace($script:activeDmConversationId) -or
                $conversationId -eq $script:activeDmConversationId
        }

        if ($shouldReset) {
            Clear-MessagePane
            $script:pollMarkerPending = $true
            $script:lastRxAt = [DateTime]::UtcNow
        }

        Request-Render
        return $true
    }

    if ($type -eq "message") {
        $line = Format-ProtocolMessageLine $event
        $id = Get-ProtocolString $event "id"
        $isNewMessage = if ($id) { $script:seenMessageIds.Add($id) } else { $script:seenMessageLines.Add($line) }
        if ($isNewMessage -and $script:seenMessageLines.Add($line)) {
            $script:pollMarkerPending = $false
            $thread = Get-ProtocolString $event "thread" "message"
            $source = Get-ProtocolString $event "source" "unknown"
            $conversationId = Get-ProtocolString $event "conversationId"
            $sender = Get-ProtocolString $event "senderLabel" (Get-ProtocolString $event "senderId" "")
            if (
                $thread -eq "dm" -and
                $source -eq "poll" -and
                $script:currentMode -eq "dm" -and
                -not [string]::IsNullOrWhiteSpace($conversationId) -and
                [string]::IsNullOrWhiteSpace($script:activeDmConversationId)
            ) {
                $script:activeDmConversationId = $conversationId
            }

            if (-not (Register-InactiveUnread $thread $sender $conversationId)) {
                Add-MessageLine $line
            }
        }
        $script:lastRxAt = [DateTime]::UtcNow
        Request-Render
        return $true
    }

    if ($type -eq "sent") {
        $script:lastSentAt = [DateTime]::UtcNow
        $thread = Get-ProtocolString $event "thread" "message"
        if ($thread -eq "dm") {
            $conversationId = Get-ProtocolString $event "conversationId"
            if (-not [string]::IsNullOrWhiteSpace($conversationId)) {
                $script:activeDmConversationId = $conversationId
            }
        }
        Add-LiveFeedLine "sent: $thread"
        Request-Render
        return $true
    }

    return $true
}

function Test-NoisyRealtimeLine {
    param([string]$Line)

    if ([string]::IsNullOrWhiteSpace($Line)) {
        return $false
    }

    return (
        $Line -match "^\s*[EW]\s+\(\d+\)\s+transport_ws:" -or
        $Line -match "^\s*[EW]\s+\(\d+\)\s+esp-tls:" -or
        $Line -match "^\s*[EW]\s+\(\d+\)\s+TRANSPORT_BASE:" -or
        $Line -match "^\s*[EW]\s+\(\d+\)\s+WEBSOCKET_CLIENT:" -or
        $Line -match "^\s*[DIW]\s+\(\d+\)\s+wifi:" -or
        $Line -match "^\s*[DIW]\s+\(\d+\)\s+esp_netif_handlers:" -or
        $Line -match "^\s*[DIW]\s+\(\d+\)\s+tinyusb_msc_storage:" -or
        $Line -match '^\s*,?"(?:type|thread|source|id|createdAt|senderId|senderLabel|content|conversationId)":' -or
        $Line -match '^\s*"?[A-Fa-f0-9]{8,}","deviceId":"' -or
        $Line -match '^\s*\{?"deviceId":"[A-Fa-f0-9-]+"' -or
        $Line -match '^\s*"deviceId":"[A-Fa-f0-9-]+"'
    )
}

function Request-Render {
    $script:renderDirty = $true
}

function Fit-Text {
    param(
        [string]$Text,
        [int]$Width
    )

    if ($Width -le 0) {
        return ""
    }

    $clean = Remove-Ansi $Text
    if ($clean.Length -le $Width) {
        return $clean.PadRight($Width)
    }

    if ($Width -le 3) {
        return $clean.Substring(0, $Width)
    }

    return ($clean.Substring(0, $Width - 3) + "...")
}

function Get-ModeLabel {
    if ($script:currentMode -eq "dm") {
        if ([string]::IsNullOrWhiteSpace($script:dmRecipientUserId)) {
            return "DM"
        }

        return "DM $($script:dmRecipientUserId)"
    }

    if ($script:currentMode -eq "admin") {
        return "ADMIN"
    }

    return "GROUP"
}

function Get-ExpiryHealthLabel {
    param([string]$Value)

    if ([string]::IsNullOrWhiteSpace($Value) -or $Value -eq "(none)") {
        return "missing"
    }

    try {
        $expiresAt = [DateTimeOffset]::Parse($Value).UtcDateTime
        $remaining = $expiresAt - [DateTime]::UtcNow
        if ($remaining.TotalSeconds -le 0) {
            return "expired"
        }
        if ($remaining.TotalMinutes -lt 10) {
            return "$([Math]::Max(1, [int][Math]::Ceiling($remaining.TotalMinutes)))m"
        }
        return "ok"
    } catch {
        return "unknown"
    }
}

function Get-HealthLabel {
    $dataLink = Get-DataLinkLabel $script:bridgeHealth.wifi
    $device = $script:bridgeHealth.device
    $session = Get-ExpiryHealthLabel $script:bridgeHealth.session
    $auth = Get-ExpiryHealthLabel $script:bridgeHealth.auth
    return "data link: $dataLink | device: $device | session: $session | auth: $auth | rt: $($script:bridgeHealth.realtime)"
}

function Get-VersionLabel {
    return "v$script:tuiVersion $script:tuiVersionDate"
}

function Get-LiveTransportLabel {
    if ($script:realtimeConnected) {
        return "live: realtime"
    }

    if ($script:liveReceive) {
        return "live: ${PollSeconds}s"
    }

    return "live: paused"
}

function Get-PollFallbackLabel {
    if ($script:realtimeConnected) {
        "fallback idle"
    } elseif ($script:liveReceive) {
        "fallback ${PollSeconds}s"
    } else {
        "fallback off"
    }
}

function Get-SidebarLines {
    $pollLabel = Get-PollFallbackLabel
    $rxLabel = if ($script:lastRxAt) { $script:lastRxAt.ToLocalTime().ToString("HH:mm:ss") } else { "none" }
    $sentLabel = if ($script:lastSentAt) { $script:lastSentAt.ToLocalTime().ToString("HH:mm:ss") } else { "none" }
    $protocolLabel = if ($script:protocolEnabled) { $script:bridgeHealth.serial } else { "off" }
    $scrollLabel = if ($script:messageScrollOffset -gt 0) { "+$script:messageScrollOffset" } else { "latest" }

    return @(
        "SHADOWCHAT BRIDGE",
        "tools $script:tuiVersion",
        "date  $script:tuiVersionDate",
        "",
        "mode  $(Get-ModeLabel)",
        "unrd  $(Get-UnreadSidebarLabel)",
        "view  $scrollLabel",
        "port  $Port",
        "poll  $pollLabel",
        "rx    $rxLabel",
        "sent  $sentLabel",
        "proto $protocolLabel",
        "rt    $($script:bridgeHealth.realtime)",
        "",
        "link  $(Get-DataLinkLabel $script:bridgeHealth.wifi)",
        "dev   $($script:bridgeHealth.device)",
        "sess  $(Get-ExpiryHealthLabel $script:bridgeHealth.session)",
        "auth  $(Get-ExpiryHealthLabel $script:bridgeHealth.auth)",
        "",
        "Tab       swap",
        "PgUp/Dn   scroll",
        "End       latest",
        "@ai       Shado",
        "/users    find",
        "/dms      recent",
        "/dm name  DM",
        "/group    group",
        "/live     toggle",
        "/admin    shell"
    )
}

function Get-InputLine {
    param([int]$Width = 0)

    $prompt = Get-Prompt
    $cursor = "_"
    $buffer = Get-DisplayText $script:inputBuffer

    if ($Width -le 0) {
        return "$prompt$buffer$cursor"
    }

    $available = [Math]::Max(0, $Width - $prompt.Length - $cursor.Length)
    $visible = $buffer
    if ($buffer.Length -gt $available) {
        if ($available -le 3) {
            $visible = $buffer.Substring($buffer.Length - $available)
        } else {
            $tailLength = $available - 3
            $visible = "..." + $buffer.Substring($buffer.Length - $tailLength)
        }
    }

    return "$prompt$visible$cursor"
}

function Write-FitSegment {
    param(
        [string]$Text,
        [int]$Width,
        [ConsoleColor]$Color = [ConsoleColor]::Gray,
        [switch]$NoNewline
    )

    Write-Ui (Fit-Text $Text $Width) $Color -NoNewline:$NoNewline
}

function Write-MessageSegment {
    param(
        [string]$Text,
        [int]$Width,
        [switch]$NoNewline
    )

    $color = Get-LineColor $Text
    Write-Ui (Format-MessagePaneLine $Text $Width) $color -NoNewline:$NoNewline
}

function Render-Layout {
    param([switch]$Force)

    if (-not $script:layoutEnabled) {
        return
    }

    $now = [DateTime]::UtcNow
    $terminalWidth = [Math]::Max(40, [Console]::WindowWidth)
    $width = [Math]::Max(39, $terminalWidth - 1)
    $height = [Math]::Max(12, [Console]::WindowHeight)
    $resized = $width -ne $script:lastLayoutWidth -or $height -ne $script:lastLayoutHeight

    if (-not $Force -and -not $script:renderDirty -and -not $resized) {
        return
    }

    if (-not $Force -and (($now - $script:lastRenderAt).TotalMilliseconds -lt 80)) {
        return
    }

    $script:lastRenderAt = $now
    $script:renderDirty = $false
    $script:lastLayoutWidth = $width
    $script:lastLayoutHeight = $height

    $bodyHeight = [Math]::Max(4, $height - 4)
    $divider = "-" * $width
    $pollLabel = Get-LiveTransportLabel
    $rxLabel = if ($script:lastRxAt) { "rx: $($script:lastRxAt.ToLocalTime().ToString("HH:mm:ss"))" } else { "rx: none" }
    $useThreePane = $width -ge 132
    $useTwoPane = -not $useThreePane -and $width -ge 96
    $statusWidth = if ($useThreePane) { 24 } else { 0 }
    $feedWidth = if ($useThreePane) { 34 } elseif ($useTwoPane) { 30 } else { 0 }
    $separatorWidth = if ($useThreePane) { 6 } elseif ($useTwoPane) { 3 } else { 0 }
    $messageWidth = $width - $statusWidth - $feedWidth - $separatorWidth
    $statusLines = @(if ($useThreePane) { Get-SidebarLines })
    $messageRows = @(Get-MessageRenderRows $messageWidth)
    $maxScrollOffset = [Math]::Max(0, $messageRows.Count - $bodyHeight)
    if ($script:messageScrollOffset -gt $maxScrollOffset) {
        $script:messageScrollOffset = $maxScrollOffset
    }
    $messageStart = [Math]::Max(0, $messageRows.Count - $bodyHeight - $script:messageScrollOffset)
    $messageTopPadding = Get-MessageTopPadding $messageRows.Count $bodyHeight $script:messageScrollOffset
    $feedStart = [Math]::Max(0, $script:liveFeed.Count - $bodyHeight)
    $scrollLabel = if ($script:messageScrollOffset -gt 0) { " | scroll: +$script:messageScrollOffset" } else { "" }

    [Console]::SetCursorPosition(0, 0)
    Write-Ui (Fit-Text "ShadowChat Bridge TUI $(Get-VersionLabel) | $Port @ $BaudRate | $(Get-ModeLabel) | $pollLabel | $rxLabel$(Get-UnreadSummaryLabel)$scrollLabel | $(Get-HealthLabel)" $width) ([ConsoleColor]::Yellow)
    Write-Ui $divider ([ConsoleColor]::DarkGray)

    for ($i = 0; $i -lt $bodyHeight; $i++) {
        $messageIndex = $messageStart + $i - $messageTopPadding
        $feedIndex = $feedStart + $i
        $statusLine = if ($i -lt $statusLines.Count) { $statusLines[$i] } else { "" }
        $messageRow = if ($messageIndex -ge 0 -and $messageIndex -lt $messageRows.Count) { $messageRows[$messageIndex] } else { $null }
        $feedLine = if ($feedIndex -lt $script:liveFeed.Count) { $script:liveFeed[$feedIndex] } else { "" }

        if ($useThreePane) {
            Write-FitSegment $statusLine $statusWidth ([ConsoleColor]::DarkYellow) -NoNewline
            Write-Ui " | " ([ConsoleColor]::DarkGray) -NoNewline
            Write-MessageRenderRow $messageRow $messageWidth -NoNewline
            Write-Ui " | " ([ConsoleColor]::DarkGray) -NoNewline
            Write-FitSegment $feedLine $feedWidth (Get-LineColor $feedLine)
        } elseif ($useTwoPane) {
            Write-MessageRenderRow $messageRow $messageWidth -NoNewline
            Write-Ui " | " ([ConsoleColor]::DarkGray) -NoNewline
            Write-FitSegment $feedLine $feedWidth (Get-LineColor $feedLine)
        } else {
            Write-MessageRenderRow $messageRow $width
        }
    }

    Write-Ui $divider ([ConsoleColor]::DarkGray)
    $promptLine = Get-InputLine $width
    Write-Ui (Fit-Text $promptLine $width) ([ConsoleColor]::White) -NoNewline
}

function Render-InputLine {
    if (-not $script:layoutEnabled) {
        return
    }

    $terminalWidth = [Math]::Max(40, [Console]::WindowWidth)
    $width = [Math]::Max(39, $terminalWidth - 1)
    $height = [Math]::Max(12, [Console]::WindowHeight)

    try {
        [Console]::SetCursorPosition(0, $height - 1)
        Write-Ui (Fit-Text (Get-InputLine $width) $width) ([ConsoleColor]::White) -NoNewline
    } catch {
        Request-Render
    }
}

function Write-BridgeLine {
    param([string]$Line)

    $clean = Normalize-BridgeLine $Line
    if ([string]::IsNullOrWhiteSpace($clean)) {
        return
    }

    if (Try-HandleProtocolLine $clean) {
        return
    }

    if (Test-NoisyRealtimeLine $clean) {
        $script:realtimeNoiseSkipCount += 1
        Queue-RealtimeBackfill
        Request-Render
        return
    }

    if ($script:statusCaptureActive -and $clean -notmatch "^\s{2}[a-zA-Z_]+:") {
        $script:statusCaptureActive = $false
        $script:statusCaptureQuiet = $false
    }

    if ($clean -eq "Bridge status") {
        $script:statusCaptureActive = $true
        $script:statusCaptureQuiet = $script:quietStatusPending
        $script:quietStatusPending = $false
        if ($script:statusCaptureQuiet) {
            Request-Render
            return
        }
    } elseif ($script:statusCaptureActive -and $clean -match "^\s{2}[a-zA-Z_]+:") {
        Update-BridgeHealthFromStatusLine $clean
        if ($script:statusCaptureQuiet) {
            Request-Render
            return
        }
    }

    $isMessageLine = Test-BridgeMessageLine $clean

    if ($isMessageLine -and -not $script:seenMessageLines.Add($clean)) {
        $script:lastRxAt = [DateTime]::UtcNow
        return
    }

    $displayLine = if ($isMessageLine) { $clean } else { Format-TuiDisplayLine $clean }

    if ($isMessageLine) {
        $script:pollMarkerPending = $false
        Add-MessageLine $displayLine
        $script:lastRxAt = [DateTime]::UtcNow
    } else {
        Add-LiveFeedLine $displayLine
    }

    if ($script:layoutEnabled) {
        Request-Render
        return
    }

    if (-not $isMessageLine -and $script:lastLiveFeedLineSuppressed) {
        return
    }

    Write-Ui $displayLine (Get-LineColor $displayLine)
}

function Read-SerialOutput {
    param([switch]$Quiet)

    if (-not $script:serial -or -not $script:serial.IsOpen) {
        return
    }

    $chunk = $script:serial.ReadExisting()
    if ([string]::IsNullOrEmpty($chunk)) {
        return
    }

    $script:incomingBuffer += $chunk

    while ($script:incomingBuffer -match "\r?\n") {
        $newlineMatch = [regex]::Match($script:incomingBuffer, "\r?\n")
        $line = $script:incomingBuffer.Substring(0, $newlineMatch.Index)
        $script:incomingBuffer = $script:incomingBuffer.Substring($newlineMatch.Index + $newlineMatch.Length)
        if (-not $Quiet) {
            Write-BridgeLine $line
        }
    }
}

function Wait-ForTranscriptPattern {
    param(
        [string]$Pattern,
        [int]$Seconds = 5,
        [switch]$Quiet
    )

    $startIndex = $script:transcript.Count
    $deadline = [DateTime]::UtcNow.AddSeconds($Seconds)
    while ([DateTime]::UtcNow -lt $deadline) {
        Read-SerialOutput -Quiet:$Quiet
        $newLines = @()
        if ($script:transcript.Count -gt $startIndex) {
            $newLines = $script:transcript[$startIndex..($script:transcript.Count - 1)]
        }
        $joined = $newLines -join "`n"
        if ($joined -match $Pattern) {
            return $true
        }
        Start-Sleep -Milliseconds 100
    }

    return $false
}

function Send-BridgeLine {
    param([string]$Line)

    if (-not $script:serial -or -not $script:serial.IsOpen) {
        throw "Serial port is not open."
    }

    try {
        $script:serial.WriteLine($Line)
    } catch {
        throw "Could not write to $Port. Close other serial monitors, reset the ESP bridge, and try again. $($_.Exception.Message)"
    }
}

function Enter-BridgeMode {
    param(
        [ValidateSet("group", "dm", "admin")]
        [string]$NextMode,
        [string]$RecipientUserId = ""
    )

    $ensureAdminMode = {
        if ($script:currentMode -ne "admin") {
            Send-BridgeLine "/admin"
            Start-Sleep -Milliseconds 150
            Read-SerialOutput
            $script:currentMode = "admin"
        }
    }

    if ($NextMode -eq "group") {
        & $ensureAdminMode
        $script:currentMode = "group"
        $script:dmRecipientUserId = ""
        $script:activeDmConversationId = ""
        Clear-UnreadForThread "group"
        Clear-MessagePane
        Send-BridgeLine "chat group"
        $script:lastPollAt = [DateTime]::UtcNow
        Save-BridgeTuiPreferencesQuiet -Path $script:preferencesPath
        Request-Render
        return
    }

    if ($NextMode -eq "dm") {
        if ([string]::IsNullOrWhiteSpace($RecipientUserId)) {
            Write-Ui "Usage: /dm <recipient_user_id>" ([ConsoleColor]::Yellow)
            return
        }

        & $ensureAdminMode
        $script:currentMode = "dm"
        $script:dmRecipientUserId = $RecipientUserId
        $script:activeDmConversationId = ""
        Add-RecentDm $RecipientUserId
        Clear-UnreadForThread "dm"
        Clear-MessagePane
        Send-BridgeLine "chat dm $RecipientUserId"
        $script:lastPollAt = [DateTime]::UtcNow
        Save-BridgeTuiPreferencesQuiet -Path $script:preferencesPath
        Request-Render
        return
    }

    if ($script:currentMode -ne "admin") {
        Send-BridgeLine "/admin"
    }
    $script:currentMode = "admin"
    Clear-MessagePane
    Save-BridgeTuiPreferencesQuiet -Path $script:preferencesPath
    Request-Render
}

function Invoke-Poll {
    if ($script:currentMode -eq "group" -or $script:currentMode -eq "dm") {
        $script:pollMarkerPending = $true
        Send-BridgeLine "/poll"
        $script:lastPollAt = [DateTime]::UtcNow
    }
}

function Invoke-StatusCommand {
    param([switch]$Quiet)

    if ($Quiet) {
        $script:quietStatusPending = $true
    }

    if ($script:currentMode -eq "admin") {
        Send-BridgeLine "status"
    } else {
        Send-BridgeLine "/status"
    }

    $script:lastStatusAt = [DateTime]::UtcNow
}

function Invoke-AdminCommand {
    param([string]$Command)

    $previousMode = $script:currentMode
    $previousDm = $script:dmRecipientUserId

    if ($script:currentMode -ne "admin") {
        Send-BridgeLine "/admin"
        Start-Sleep -Milliseconds 150
        Read-SerialOutput
    }

    $script:currentMode = "admin"
    Send-BridgeLine $Command

    if ($previousMode -eq "group") {
        Start-Sleep -Milliseconds 250
        Read-SerialOutput
        Enter-BridgeMode "group"
    } elseif ($previousMode -eq "dm" -and -not [string]::IsNullOrWhiteSpace($previousDm)) {
        Start-Sleep -Milliseconds 250
        Read-SerialOutput
        Enter-BridgeMode "dm" $previousDm
    }
}

function Invoke-UsersSearch {
    param([string]$Query)

    if ([string]::IsNullOrWhiteSpace($Query)) {
        Add-LiveFeedLine "Usage: /users <name_or_username>"
        Request-Render
        return
    }

    Add-LiveFeedLine "Searching users: $Query"
    Invoke-AdminCommand "users search $Query"
    Request-Render
}

function Sync-BridgeAdmin {
    Read-SerialOutput -Quiet
    for ($i = 0; $i -lt 4; $i++) {
        Send-BridgeLine "/admin"
        if (Wait-ForTranscriptPattern "(Returned to admin shell|Already in admin shell|bridge>\\s*)" 3) {
            $script:currentMode = "admin"
            return
        }
    }

    throw "Could not sync bridge into admin shell before starting smoke."
}

function Enable-StructuredProtocol {
    if (-not $script:protocolEnabled) {
        $script:bridgeHealth.serial = "text"
        return
    }

    Send-BridgeLine "protocol on"
    $script:bridgeHealth.serial = "requested"
    Start-Sleep -Milliseconds 150
    Read-SerialOutput
    Send-BridgeLine "realtime start"
    Start-Sleep -Milliseconds 150
    Read-SerialOutput
}

function Show-Help {
    $lines = @(
        "",
        "ShadowChat Bridge TUI",
        "  Plain text sends to the active chat thread.",
        "  /poll                 refresh active chat",
        "  /group                switch to group chat",
        "  /dm <recipient|@name> switch to a DM",
        "  @ai <question>       ask Shado in group chat",
        "  /users <name>         search users in the side feed",
        "  /dms                  show recent DM targets",
        "  Tab                   cycle group and recent DMs",
        "  PageUp/PageDown       scroll message history",
        "  Home/End              oldest/latest visible messages",
        "  /poll-interval <sec>  change auto-poll interval",
        "  /live on|off          toggle near-realtime polling",
        "  /realtime on|off      toggle WebSocket receive",
        "  /status-interval <sec> change health refresh interval",
        "  /status               show bridge status",
        "  /protocol on|off      toggle structured serial events",
        "  /admin                enter raw admin shell mode",
        "  /chat                 return from admin shell to chat",
        "  /prefs                show active preferences",
        "  /save                 save current preferences",
        "  /quit                 exit",
        ""
    )

    foreach ($line in $lines) {
        if ($script:layoutEnabled) {
            Add-LiveFeedLine $line
        } else {
            Write-Ui $line ($(if ($line -eq "ShadowChat Bridge TUI") { [ConsoleColor]::Yellow } else { [ConsoleColor]::Gray }))
        }
    }

    Request-Render
}

function Show-Preferences {
    $lines = @(
        "Preferences",
        "  path: $script:preferencesPath",
        "  port: $Port",
        "  baud_rate: $BaudRate",
        "  mode: $script:currentMode",
        "  dm_recipient_user_id: $(if ($script:dmRecipientUserId) { $script:dmRecipientUserId } else { "(none)" })",
        "  recent_dms: $(if ($script:recentDms.Count) { $script:recentDms -join ", " } else { "(none)" })",
        "  poll_seconds: $PollSeconds",
        "  status_seconds: $StatusSeconds",
        "  live_receive: $script:liveReceive",
        "  protocol_enabled: $script:protocolEnabled",
        "  health: $(Get-HealthLabel)",
        "  transcript_lines: $script:transcriptLimit"
    )

    foreach ($line in $lines) {
        if ($script:layoutEnabled) {
            Add-LiveFeedLine $line
        } else {
            Write-Ui $line ([ConsoleColor]::Yellow)
        }
    }

    Request-Render
}

function Get-Prompt {
    if ($script:currentMode -eq "dm") {
        return "dm> "
    }

    if ($script:currentMode -eq "admin") {
        return "admin> "
    }

    return "group> "
}

function Process-InputLine {
    param([string]$Line)

    if ([string]::IsNullOrWhiteSpace($Line)) {
        return
    }

    if ($Line -eq "/help") {
        Show-Help
    } elseif ($Line -eq "/quit" -or $Line -eq "/exit") {
        $script:running = $false
    } elseif ($Line -eq "/poll") {
        Invoke-Poll
    } elseif ($Line -match "^/poll-interval\s+(\d+)$") {
        $nextInterval = [Math]::Max(2, [int]$Matches[1])
        Set-Variable -Name PollSeconds -Scope Script -Value $nextInterval
        Add-LiveFeedLine "Auto-poll interval set to $nextInterval seconds"
        Save-BridgeTuiPreferencesQuiet -Path $script:preferencesPath
        Request-Render
    } elseif ($Line -eq "/live") {
        $script:liveReceive = -not $script:liveReceive
        Add-LiveFeedLine "Live receive polling $(if ($script:liveReceive) { "enabled" } else { "paused" })"
        Save-BridgeTuiPreferencesQuiet -Path $script:preferencesPath
        Request-Render
    } elseif ($Line -eq "/live on" -or $Line -eq "/autopoll on") {
        $script:liveReceive = $true
        Add-LiveFeedLine "Live receive polling enabled"
        Save-BridgeTuiPreferencesQuiet -Path $script:preferencesPath
        Request-Render
    } elseif ($Line -eq "/live off" -or $Line -eq "/autopoll off") {
        $script:liveReceive = $false
        Add-LiveFeedLine "Live receive polling paused"
        Save-BridgeTuiPreferencesQuiet -Path $script:preferencesPath
        Request-Render
    } elseif ($Line -eq "/protocol on") {
        $script:protocolEnabled = $true
        Send-BridgeLine $(if ($script:currentMode -eq "admin") { "protocol on" } else { "/protocol on" })
        Add-LiveFeedLine "Structured serial protocol requested"
        Save-BridgeTuiPreferencesQuiet -Path $script:preferencesPath
        Request-Render
    } elseif ($Line -eq "/protocol off") {
        Send-BridgeLine $(if ($script:currentMode -eq "admin") { "protocol off" } else { "/protocol off" })
        $script:protocolEnabled = $false
        $script:bridgeHealth.serial = "off"
        Add-LiveFeedLine "Structured serial protocol disabled"
        Save-BridgeTuiPreferencesQuiet -Path $script:preferencesPath
        Request-Render
    } elseif ($Line -eq "/realtime" -or $Line -eq "/realtime status") {
        Send-BridgeLine $(if ($script:currentMode -eq "admin") { "realtime status" } else { "/realtime status" })
        Add-LiveFeedLine "Realtime status requested"
        Request-Render
    } elseif ($Line -eq "/realtime on" -or $Line -eq "/realtime start") {
        Send-BridgeLine $(if ($script:currentMode -eq "admin") { "realtime start" } else { "/realtime start" })
        Add-LiveFeedLine "Realtime WebSocket requested"
        Request-Render
    } elseif ($Line -eq "/realtime off" -or $Line -eq "/realtime stop") {
        Send-BridgeLine $(if ($script:currentMode -eq "admin") { "realtime stop" } else { "/realtime stop" })
        $script:realtimeConnected = $false
        $script:bridgeHealth.realtime = "off"
        Add-LiveFeedLine "Realtime WebSocket stopping"
        Request-Render
    } elseif ($Line -match "^/status-interval\s+(\d+)$") {
        $nextInterval = [Math]::Max(0, [int]$Matches[1])
        Set-Variable -Name StatusSeconds -Scope Script -Value $nextInterval
        Add-LiveFeedLine "Health refresh interval set to $(if ($nextInterval -eq 0) { "manual" } else { "$nextInterval seconds" })"
        Save-BridgeTuiPreferencesQuiet -Path $script:preferencesPath
        Request-Render
    } elseif ($Line -eq "/group") {
        Enter-BridgeMode "group"
    } elseif ($Line -match "^/dm\s+(.+)$") {
        Enter-BridgeMode "dm" $Matches[1].Trim()
    } elseif ($Line -match "^/users\s+(.+)$") {
        Invoke-UsersSearch $Matches[1].Trim()
    } elseif ($Line -eq "/users") {
        Add-LiveFeedLine "Usage: /users <name_or_username>"
        Request-Render
    } elseif ($Line -eq "/dms") {
        Show-RecentDms
    } elseif ($Line -eq "/admin") {
        Enter-BridgeMode "admin"
    } elseif ($Line -eq "/chat") {
        if ($script:dmRecipientUserId) {
            Enter-BridgeMode "dm" $script:dmRecipientUserId
        } else {
            Enter-BridgeMode "group"
        }
    } elseif ($Line -eq "/status") {
        Invoke-StatusCommand
    } elseif ($Line -eq "/prefs") {
        Show-Preferences
    } elseif ($Line -eq "/save") {
        Save-BridgeTuiPreferences -Path $script:preferencesPath
        Add-LiveFeedLine "Saved preferences to $script:preferencesPath"
        Request-Render
    } elseif ($script:currentMode -eq "admin") {
        Send-BridgeLine $Line
    } else {
        Reset-MessageScroll
        Send-BridgeLine $Line
        $script:lastSentAt = [DateTime]::UtcNow
        $script:lastPollAt = [DateTime]::UtcNow.AddSeconds(-[Math]::Max(1, $PollSeconds - 1))
        Queue-PostSendBackfill
        Request-Render
    }
}

function Connect-Serial {
    $portInstance = [System.IO.Ports.SerialPort]::new($Port, $BaudRate)
    $portInstance.Encoding = $script:utf8NoBom
    $portInstance.NewLine = "`n"
    $portInstance.ReadTimeout = 50
    $portInstance.WriteTimeout = 10000
    $portInstance.DtrEnable = $true
    $portInstance.RtsEnable = $true
    $portInstance.Open()
    try {
        $portInstance.DiscardInBuffer()
        $portInstance.DiscardOutBuffer()
    } catch {
        # Some serial drivers do not support discard immediately after open.
    }
    return $portInstance
}

function Wait-BridgeOutput {
    param([int]$Seconds)

    $deadline = [DateTime]::UtcNow.AddSeconds($Seconds)
    while ([DateTime]::UtcNow -lt $deadline) {
        Read-SerialOutput
        Invoke-PendingRealtimeBackfill
        Invoke-PostSendBackfill
        Start-Sleep -Milliseconds 100
    }
}

function Assert-SmokeTranscriptHealthy {
    param([string]$Transcript)

    $hasTextStatus = $Transcript -match "Bridge status" -and $Transcript -match "data_link: established"
    $hasProtocolStatus = (Get-DataLinkLabel $script:bridgeHealth.wifi) -eq "established" -and
        $script:bridgeHealth.device -eq "paired" -and
        $script:bridgeHealth.session -eq "ok" -and
        $script:bridgeHealth.auth -eq "ok"

    if (-not ($hasTextStatus -or $hasProtocolStatus)) {
        throw "Smoke check did not observe bridge status with the data link established."
    }

    $failurePattern = "(?im)(HTTP\s+(401|403|5\d\d)|Invalid bridge access token|Bridge access token has expired|ESP_ERR_HTTP_CONNECT|failed:|Unknown command|timed out)"
    if ($Transcript -match $failurePattern) {
        throw "Smoke check observed bridge errors in the transcript."
    }
}

function Run-Smoke {
    Write-Ui "Running bridge TUI smoke on $Port..." ([ConsoleColor]::Yellow)
    Sync-BridgeAdmin
    Enable-StructuredProtocol

    $smokeDmRecipient = if (-not [string]::IsNullOrWhiteSpace($SmokeDmRecipientUserId)) {
        $SmokeDmRecipientUserId
    } else {
        $DmRecipientUserId
    }

    if ($Mode -eq "dm") {
        Enter-BridgeMode "dm" $smokeDmRecipient
    } elseif ($Mode -eq "admin") {
        Enter-BridgeMode "admin"
    } else {
        Enter-BridgeMode "group"
    }

    Wait-BridgeOutput 7

    if ($script:currentMode -eq "group" -and -not [string]::IsNullOrWhiteSpace($SmokeGroupText)) {
        Write-Ui "Smoke sending group message..." ([ConsoleColor]::Yellow)
        Send-BridgeLine $SmokeGroupText
        Wait-BridgeOutput 12
        Invoke-Poll
        Wait-BridgeOutput 10

        $groupTranscript = $script:transcript -join "`n"
        if ($groupTranscript -notmatch [regex]::Escape($SmokeGroupText)) {
            throw "Smoke check did not observe the sent group message in poll output."
        }
    }

    if ($script:currentMode -ne "admin") {
        Invoke-Poll
        Wait-BridgeOutput 8
    }

    if (-not [string]::IsNullOrWhiteSpace($smokeDmRecipient)) {
        Write-Ui "Smoke checking DM thread..." ([ConsoleColor]::Yellow)
        Enter-BridgeMode "dm" $smokeDmRecipient
        Wait-BridgeOutput 7

        if (-not [string]::IsNullOrWhiteSpace($SmokeDmText)) {
            Write-Ui "Smoke sending DM..." ([ConsoleColor]::Yellow)
            Send-BridgeLine $SmokeDmText
            Wait-BridgeOutput 12
            Invoke-Poll
            Wait-BridgeOutput 10

            $dmTranscript = $script:transcript -join "`n"
            if ($dmTranscript -notmatch [regex]::Escape($SmokeDmText)) {
                throw "Smoke check did not observe the sent DM in poll output."
            }
        } else {
            Invoke-Poll
            Wait-BridgeOutput 8
        }
    }

    Invoke-AdminCommand "status"
    Wait-BridgeOutput 5

    $joined = $script:transcript -join "`n"
    Assert-SmokeTranscriptHealthy $joined

    if ($script:currentMode -ne "admin") {
        Send-BridgeLine "/admin"
        Start-Sleep -Milliseconds 250
        Read-SerialOutput
        $script:currentMode = "admin"
    }

    Write-Ui "Bridge TUI smoke passed." ([ConsoleColor]::Green)
}

function Run-Interactive {
    if ([Console]::IsInputRedirected) {
        throw "Interactive mode needs a real console. Use -Smoke for non-interactive checks."
    }

    $script:layoutEnabled = Use-Color
    if ($script:layoutEnabled) {
        [Console]::CursorVisible = $false
        [Console]::Clear()
    }

    if ($script:layoutEnabled) {
        Add-LiveFeedLine "Opening $Port at $BaudRate baud..."
        Add-LiveFeedLine "Ready. Type /help for commands."
        Request-Render
        Render-Layout -Force
    } else {
        Show-Help
        Write-Ui "Opening $Port at $BaudRate baud..." ([ConsoleColor]::Yellow)
    }
    Sync-BridgeAdmin
    Enable-StructuredProtocol
    Invoke-StatusCommand -Quiet
    Start-Sleep -Milliseconds 250
    Read-SerialOutput

    if ($Mode -eq "dm") {
        Enter-BridgeMode "dm" $DmRecipientUserId
    } elseif ($Mode -eq "admin") {
        Enter-BridgeMode "admin"
    } else {
        Enter-BridgeMode "group"
    }

    while ($script:running) {
        Read-SerialOutput
        Invoke-PendingRealtimeBackfill
        Invoke-PostSendBackfill

        if ($script:liveReceive -and -not $script:realtimeConnected -and ($script:currentMode -eq "group" -or $script:currentMode -eq "dm")) {
            $elapsed = [DateTime]::UtcNow - $script:lastPollAt
            if ($elapsed.TotalSeconds -ge $PollSeconds) {
                Invoke-Poll
            }
        }

        if ($StatusSeconds -gt 0) {
            $statusElapsed = [DateTime]::UtcNow - $script:lastStatusAt
            if ($statusElapsed.TotalSeconds -ge $StatusSeconds) {
                Invoke-StatusCommand -Quiet
            }
        }

        if ($script:layoutEnabled) {
            Render-Layout
        }

        if ([Console]::KeyAvailable) {
            $key = [Console]::ReadKey($true)

            if ($key.Key -eq [ConsoleKey]::Enter) {
                $line = $script:inputBuffer
                $script:inputBuffer = ""
                if ($script:layoutEnabled) {
                    Render-InputLine
                } else {
                    Request-Render
                }
                Process-InputLine $line
            } elseif ($key.Key -eq [ConsoleKey]::Backspace) {
                if ($script:inputBuffer.Length -gt 0) {
                    $script:inputBuffer = $script:inputBuffer.Substring(0, $script:inputBuffer.Length - 1)
                    if ($script:layoutEnabled) {
                        Render-InputLine
                    } else {
                        Write-Host -NoNewline "`b `b"
                    }
                }
            } elseif ($key.Key -eq [ConsoleKey]::Tab) {
                Switch-NextConversation
            } elseif ($key.Key -eq [ConsoleKey]::PageUp) {
                Move-MessageScroll (Get-MessagePageSize)
            } elseif ($key.Key -eq [ConsoleKey]::PageDown) {
                Move-MessageScroll (-1 * (Get-MessagePageSize))
            } elseif ($key.Key -eq [ConsoleKey]::Home) {
                Move-MessageScrollTop
            } elseif ($key.Key -eq [ConsoleKey]::End) {
                Reset-MessageScroll
            } elseif ($key.KeyChar -and -not [char]::IsControl($key.KeyChar)) {
                $script:inputBuffer += $key.KeyChar
                if ($script:layoutEnabled) {
                    Render-InputLine
                } else {
                    Write-Host -NoNewline $key.KeyChar
                }
            }
        } elseif (-not $script:layoutEnabled -and $script:inputBuffer.Length -eq 0) {
            Write-Host -NoNewline (Get-Prompt)
            Start-Sleep -Milliseconds 120
            if ($script:inputBuffer.Length -eq 0) {
                Write-Host -NoNewline "`r"
                Write-Host -NoNewline (" " * ([Math]::Min(80, (Get-Prompt).Length)))
                Write-Host -NoNewline "`r"
            }
        } else {
            Start-Sleep -Milliseconds 40
        }
    }

    if ($SavePreferences) {
        Save-BridgeTuiPreferences -Path $script:preferencesPath
    }
}

try {
    $script:serial = Connect-Serial

    if ($Smoke) {
        Run-Smoke
    } else {
        Run-Interactive
    }
} finally {
    if ($script:layoutEnabled) {
        [Console]::CursorVisible = $true
        Write-Host ""
    }
    if ($script:serial -and $script:serial.IsOpen) {
        $script:serial.Close()
    }
}
