[CmdletBinding()]
param(
    [string]$Port = "COM3",
    [int]$BaudRate = 115200,
    [ValidateSet("group", "dm", "admin")]
    [string]$Mode = "group",
    [string]$DmRecipientUserId = "",
    [int]$PollSeconds = 6,
    [int]$StatusSeconds = 45,
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
        noAutoPoll = [bool]$NoAutoPoll
        transcriptLines = $script:transcriptLimit
        updatedAt = [DateTime]::UtcNow.ToString("o")
    } | ConvertTo-Json -Depth 3 | Set-Content -LiteralPath $Path -Encoding UTF8
}

function Save-BridgeTuiPreferencesQuiet {
    param([string]$Path)

    if ($Smoke) {
        return
    }

    try {
        Save-BridgeTuiPreferences -Path $Path
    } catch {
        Add-TranscriptLine "Could not save preferences: $($_.Exception.Message)"
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
    if (-not $PSBoundParameters.ContainsKey("TranscriptLines") -and $loadedPreferences.transcriptLines) {
        $TranscriptLines = [int]$loadedPreferences.transcriptLines
    }
}

$script:serial = $null
$script:incomingBuffer = ""
$script:currentMode = $Mode
$script:dmRecipientUserId = $DmRecipientUserId
$script:lastPollAt = [DateTime]::MinValue
$script:lastStatusAt = [DateTime]::MinValue
$script:running = $true
$script:inputBuffer = ""
$script:transcript = New-Object System.Collections.Generic.List[string]
$script:transcriptLimit = [Math]::Max(40, $TranscriptLines)
$script:layoutEnabled = $false
$script:renderDirty = $true
$script:lastRenderAt = [DateTime]::MinValue
$script:lastRxAt = $null
$script:lastStatus = "starting"
$script:seenMessageLines = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
$script:pollMarkerPending = $false
$script:quietStatusPending = $false
$script:statusCaptureActive = $false
$script:statusCaptureQuiet = $false
$script:bridgeHealth = [ordered]@{
    wifi = "unknown"
    device = "unknown"
    session = "unknown"
    auth = "unknown"
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
    if (Use-Color) {
        [Console]::ForegroundColor = $Color
    }

    if ($NoNewline) {
        Write-Host -NoNewline $Text
    } else {
        Write-Host $Text
    }

    if (Use-Color) {
        [Console]::ForegroundColor = $previous
    }
}

function Remove-Ansi {
    param([string]$Text)
    $escape = [string][char]27
    return [regex]::Replace($Text, "$escape\[[0-9;?]*[ -/]*[@-~]", "")
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

    if ($Line -match "^(?:\d{4}-\d{2}-\d{2}T.*|\d{2}:\d{2}:\d{2}|\(unknown time\)) \| ([^:]+): (.*)$") {
        $sender = $Matches[1]
        if ($sender -like "bridge*") {
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

function Test-BridgeMessageLine {
    param([string]$Line)

    return $Line -match "^(?:\d{4}-\d{2}-\d{2}T.*|\d{2}:\d{2}:\d{2}|\(unknown time\)) \| [^:]+: .+"
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
    $wifi = $script:bridgeHealth.wifi
    $device = $script:bridgeHealth.device
    $session = Get-ExpiryHealthLabel $script:bridgeHealth.session
    $auth = Get-ExpiryHealthLabel $script:bridgeHealth.auth
    return "wifi: $wifi | device: $device | session: $session | auth: $auth"
}

function Render-Layout {
    param([switch]$Force)

    if (-not $script:layoutEnabled) {
        return
    }

    $now = [DateTime]::UtcNow
    if (-not $Force -and -not $script:renderDirty -and (($now - $script:lastRenderAt).TotalMilliseconds -lt 1000)) {
        return
    }

    if (-not $Force -and (($now - $script:lastRenderAt).TotalMilliseconds -lt 80)) {
        return
    }

    $script:lastRenderAt = $now
    $script:renderDirty = $false

    $width = [Math]::Max(40, [Console]::WindowWidth)
    $height = [Math]::Max(12, [Console]::WindowHeight)
    $bodyHeight = [Math]::Max(4, $height - 6)
    $divider = "-" * $width
    $pollLabel = if ($NoAutoPoll) { "poll: manual" } else { "poll: ${PollSeconds}s" }
    $rxLabel = if ($script:lastRxAt) { "rx: $($script:lastRxAt.ToLocalTime().ToString("HH:mm:ss"))" } else { "rx: none" }

    [Console]::SetCursorPosition(0, 0)
    Write-Ui (Fit-Text "ShadowChat Bridge TUI | $Port @ $BaudRate | $(Get-ModeLabel) | $pollLabel | $rxLabel | $(Get-HealthLabel)" $width) ([ConsoleColor]::Yellow)
    Write-Ui $divider ([ConsoleColor]::DarkGray)

    $start = [Math]::Max(0, $script:transcript.Count - $bodyHeight)
    for ($i = 0; $i -lt $bodyHeight; $i++) {
        $index = $start + $i
        if ($index -lt $script:transcript.Count) {
            $line = $script:transcript[$index]
            Write-Ui (Fit-Text $line $width) (Get-LineColor $line)
        } else {
            Write-Ui (" " * $width)
        }
    }

    Write-Ui $divider ([ConsoleColor]::DarkGray)
    $promptLine = "$(Get-Prompt)$($script:inputBuffer)"
    Write-Ui (Fit-Text $promptLine $width) ([ConsoleColor]::White) -NoNewline
}

function Write-BridgeLine {
    param([string]$Line)

    $clean = Normalize-BridgeLine $Line
    if ([string]::IsNullOrWhiteSpace($clean)) {
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

    if ((Test-BridgeMessageLine $clean) -and -not $script:seenMessageLines.Add($clean)) {
        $script:lastRxAt = [DateTime]::UtcNow
        return
    }

    if ((Test-BridgeMessageLine $clean) -and $script:pollMarkerPending) {
        Add-TranscriptLine "----- new messages -----"
        $script:pollMarkerPending = $false
    }

    Add-TranscriptLine $clean
    $script:lastRxAt = [DateTime]::UtcNow

    if ($script:layoutEnabled) {
        Request-Render
        return
    }

    Write-Ui $clean (Get-LineColor $clean)
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

function Show-Help {
    $lines = @(
        "",
        "ShadowChat Bridge TUI",
        "  Plain text sends to the active chat thread.",
        "  /poll                 refresh active chat",
        "  /group                switch to group chat",
        "  /dm <recipient|@name> switch to a DM",
        "  Tab                   toggle group and last DM",
        "  /poll-interval <sec>  change auto-poll interval",
        "  /status-interval <sec> change health refresh interval",
        "  /status               show bridge status",
        "  /admin                enter raw admin shell mode",
        "  /chat                 return from admin shell to chat",
        "  /prefs                show active preferences",
        "  /save                 save current preferences",
        "  /quit                 exit",
        ""
    )

    foreach ($line in $lines) {
        if ($script:layoutEnabled) {
            Add-TranscriptLine $line
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
        "  poll_seconds: $PollSeconds",
        "  status_seconds: $StatusSeconds",
        "  auto_poll: $(-not $NoAutoPoll)",
        "  health: $(Get-HealthLabel)",
        "  transcript_lines: $script:transcriptLimit"
    )

    foreach ($line in $lines) {
        if ($script:layoutEnabled) {
            Add-TranscriptLine $line
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
        Add-TranscriptLine "Auto-poll interval set to $nextInterval seconds"
        Save-BridgeTuiPreferencesQuiet -Path $script:preferencesPath
        Request-Render
    } elseif ($Line -match "^/status-interval\s+(\d+)$") {
        $nextInterval = [Math]::Max(0, [int]$Matches[1])
        Set-Variable -Name StatusSeconds -Scope Script -Value $nextInterval
        Add-TranscriptLine "Health refresh interval set to $(if ($nextInterval -eq 0) { "manual" } else { "$nextInterval seconds" })"
        Save-BridgeTuiPreferencesQuiet -Path $script:preferencesPath
        Request-Render
    } elseif ($Line -eq "/group") {
        Enter-BridgeMode "group"
    } elseif ($Line -match "^/dm\s+(.+)$") {
        Enter-BridgeMode "dm" $Matches[1].Trim()
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
        Add-TranscriptLine "Saved preferences to $script:preferencesPath"
        Request-Render
    } elseif ($script:currentMode -eq "admin") {
        Send-BridgeLine $Line
    } else {
        Send-BridgeLine $Line
    }
}

function Connect-Serial {
    $portInstance = [System.IO.Ports.SerialPort]::new($Port, $BaudRate)
    $portInstance.Encoding = $script:utf8NoBom
    $portInstance.NewLine = "`n"
    $portInstance.ReadTimeout = 50
    $portInstance.WriteTimeout = 10000
    $portInstance.DtrEnable = $false
    $portInstance.RtsEnable = $false
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
        Start-Sleep -Milliseconds 100
    }
}

function Assert-SmokeTranscriptHealthy {
    param([string]$Transcript)

    if ($Transcript -notmatch "Bridge status" -or $Transcript -notmatch "wifi_connected: yes") {
        throw "Smoke check did not observe bridge status with Wi-Fi connected."
    }

    $failurePattern = "(?im)(HTTP\s+(401|403|5\d\d)|Invalid bridge access token|Bridge access token has expired|ESP_ERR_HTTP_CONNECT|failed:|Unknown command|timed out)"
    if ($Transcript -match $failurePattern) {
        throw "Smoke check observed bridge errors in the transcript."
    }
}

function Run-Smoke {
    Write-Ui "Running bridge TUI smoke on $Port..." ([ConsoleColor]::Yellow)
    Sync-BridgeAdmin

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

    Show-Help
    if ($script:layoutEnabled) {
        Add-TranscriptLine "Opening $Port at $BaudRate baud..."
        Request-Render
        Render-Layout -Force
    } else {
        Write-Ui "Opening $Port at $BaudRate baud..." ([ConsoleColor]::Yellow)
    }
    Sync-BridgeAdmin
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

        if (-not $NoAutoPoll -and ($script:currentMode -eq "group" -or $script:currentMode -eq "dm")) {
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
                Request-Render
                Process-InputLine $line
            } elseif ($key.Key -eq [ConsoleKey]::Backspace) {
                if ($script:inputBuffer.Length -gt 0) {
                    $script:inputBuffer = $script:inputBuffer.Substring(0, $script:inputBuffer.Length - 1)
                    if ($script:layoutEnabled) {
                        Request-Render
                    } else {
                        Write-Host -NoNewline "`b `b"
                    }
                }
            } elseif ($key.Key -eq [ConsoleKey]::Tab) {
                if ($script:currentMode -eq "group" -and -not [string]::IsNullOrWhiteSpace($script:dmRecipientUserId)) {
                    Enter-BridgeMode "dm" $script:dmRecipientUserId
                } else {
                    Enter-BridgeMode "group"
                }
            } elseif ($key.KeyChar -and -not [char]::IsControl($key.KeyChar)) {
                $script:inputBuffer += $key.KeyChar
                if ($script:layoutEnabled) {
                    Request-Render
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
