[CmdletBinding()]
param(
    [string]$Port = "COM3",
    [int]$BaudRate = 115200,
    [ValidateSet("group", "dm", "admin")]
    [string]$Mode = "group",
    [string]$DmRecipientUserId = "",
    [int]$PollSeconds = 6,
    [switch]$NoAutoPoll,
    [switch]$Smoke,
    [switch]$NoAnsi,
    [switch]$SavePreferences,
    [switch]$ResetPreferences,
    [string]$PreferencesPath = "",
    [int]$TranscriptLines = 200
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

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
        noAutoPoll = [bool]$NoAutoPoll
        transcriptLines = $script:transcriptLimit
        updatedAt = [DateTime]::UtcNow.ToString("o")
    } | ConvertTo-Json -Depth 3 | Set-Content -LiteralPath $Path -Encoding UTF8
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
$script:running = $true
$script:inputBuffer = ""
$script:transcript = New-Object System.Collections.Generic.List[string]
$script:transcriptLimit = [Math]::Max(40, $TranscriptLines)
$script:layoutEnabled = $false
$script:renderDirty = $true
$script:lastRenderAt = [DateTime]::MinValue
$script:lastRxAt = $null
$script:lastStatus = "starting"

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

    if ($Line -match "^\d{4}-\d{2}-\d{2}T.* \| ([^:]+): (.*)$") {
        $sender = $Matches[1]
        if ($sender -like "bridge*") {
            return [ConsoleColor]::Cyan
        }

        return [ConsoleColor]::Green
    }

    if ($Line -match "^(sent message|sent dm)") {
        return [ConsoleColor]::Cyan
    }

    if ($Line -match "(failed|error|too long|Unknown command|timed out)") {
        return [ConsoleColor]::Red
    }

    if ($Line -match "^(Entered|Returned|ShadowChat|Bridge status|\(no messages\)|Saved|Preferences)") {
        return [ConsoleColor]::Yellow
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
    Write-Ui (Fit-Text "ShadowChat Bridge TUI | $Port @ $BaudRate | $(Get-ModeLabel) | $pollLabel | $rxLabel" $width) ([ConsoleColor]::Yellow)
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

    if ($NextMode -eq "group") {
        $script:currentMode = "group"
        Send-BridgeLine "chat group"
        $script:lastPollAt = [DateTime]::UtcNow
        Request-Render
        return
    }

    if ($NextMode -eq "dm") {
        if ([string]::IsNullOrWhiteSpace($RecipientUserId)) {
            Write-Ui "Usage: /dm <recipient_user_id>" ([ConsoleColor]::Yellow)
            return
        }

        $script:currentMode = "dm"
        $script:dmRecipientUserId = $RecipientUserId
        Send-BridgeLine "chat dm $RecipientUserId"
        $script:lastPollAt = [DateTime]::UtcNow
        Request-Render
        return
    }

    if ($script:currentMode -ne "admin") {
        Send-BridgeLine "/admin"
    }
    $script:currentMode = "admin"
    Request-Render
}

function Invoke-Poll {
    if ($script:currentMode -eq "group" -or $script:currentMode -eq "dm") {
        Send-BridgeLine "/poll"
        $script:lastPollAt = [DateTime]::UtcNow
    }
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
    Send-BridgeLine "/admin"
    Start-Sleep -Milliseconds 250
    Read-SerialOutput -Quiet
    $script:currentMode = "admin"
}

function Show-Help {
    $lines = @(
        "",
        "ShadowChat Bridge TUI",
        "  Plain text sends to the active chat thread.",
        "  /poll                 refresh active chat",
        "  /group                switch to group chat",
        "  /dm <recipient_id>    switch to a DM",
        "  /poll-interval <sec>  change auto-poll interval",
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
        "  auto_poll: $(-not $NoAutoPoll)",
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
        Invoke-AdminCommand "status"
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
    $portInstance.NewLine = "`n"
    $portInstance.ReadTimeout = 50
    $portInstance.WriteTimeout = 2000
    $portInstance.DtrEnable = $false
    $portInstance.RtsEnable = $false
    $portInstance.Open()
    return $portInstance
}

function Run-Smoke {
    Write-Ui "Running bridge TUI smoke on $Port..." ([ConsoleColor]::Yellow)
    Sync-BridgeAdmin

    if ($Mode -eq "dm") {
        Enter-BridgeMode "dm" $DmRecipientUserId
    } elseif ($Mode -eq "admin") {
        Enter-BridgeMode "admin"
    } else {
        Enter-BridgeMode "group"
    }

    $deadline = [DateTime]::UtcNow.AddSeconds(5)
    while ([DateTime]::UtcNow -lt $deadline) {
        Read-SerialOutput
        Start-Sleep -Milliseconds 100
    }

    if ($script:currentMode -ne "admin") {
        Invoke-Poll
        $deadline = [DateTime]::UtcNow.AddSeconds(5)
        while ([DateTime]::UtcNow -lt $deadline) {
            Read-SerialOutput
            Start-Sleep -Milliseconds 100
        }
    }

    Invoke-AdminCommand "status"
    $deadline = [DateTime]::UtcNow.AddSeconds(3)
    while ([DateTime]::UtcNow -lt $deadline) {
        Read-SerialOutput
        Start-Sleep -Milliseconds 100
    }

    $joined = $script:transcript -join "`n"
    if ($joined -notmatch "Bridge status" -or $joined -notmatch "wifi_connected: yes") {
        throw "Smoke check did not observe bridge status with Wi-Fi connected."
    }

    $failurePattern = "(?im)(HTTP\s+(401|403|5\d\d)|Invalid bridge access token|Bridge access token has expired|ESP_ERR_HTTP_CONNECT|failed:|Unknown command|timed out)"
    if ($joined -match $failurePattern) {
        throw "Smoke check observed bridge errors in the transcript."
    }

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
