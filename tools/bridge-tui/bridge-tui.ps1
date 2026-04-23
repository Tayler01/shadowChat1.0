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
    [switch]$NoAnsi
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$script:serial = $null
$script:incomingBuffer = ""
$script:currentMode = $Mode
$script:dmRecipientUserId = $DmRecipientUserId
$script:lastPollAt = [DateTime]::MinValue
$script:running = $true
$script:inputBuffer = ""
$script:transcript = New-Object System.Collections.Generic.List[string]

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

function Write-BridgeLine {
    param([string]$Line)

    $clean = Normalize-BridgeLine $Line
    if ([string]::IsNullOrWhiteSpace($clean)) {
        return
    }

    $script:transcript.Add($clean) | Out-Null

    if ($clean -match "^\d{4}-\d{2}-\d{2}T.* \| ([^:]+): (.*)$") {
        $sender = $Matches[1]
        if ($sender -like "bridge*") {
            Write-Ui $clean ([ConsoleColor]::Cyan)
        } else {
            Write-Ui $clean ([ConsoleColor]::Green)
        }
    } elseif ($clean -match "^(sent message|sent dm)") {
        Write-Ui $clean ([ConsoleColor]::Cyan)
    } elseif ($clean -match "(failed|error|too long|Unknown command|timed out)") {
        Write-Ui $clean ([ConsoleColor]::Red)
    } elseif ($clean -match "^(Entered|Returned|ShadowChat|Bridge status|\(no messages\))") {
        Write-Ui $clean ([ConsoleColor]::Yellow)
    } elseif ($clean -match "^\s{2}[a-zA-Z_]+:") {
        Write-Ui $clean ([ConsoleColor]::DarkGray)
    } else {
        Write-Ui $clean ([ConsoleColor]::Gray)
    }
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

    $script:serial.WriteLine($Line)
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
        return
    }

    if ($script:currentMode -ne "admin") {
        Send-BridgeLine "/admin"
    }
    $script:currentMode = "admin"
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
    Write-Ui ""
    Write-Ui "ShadowChat Bridge TUI" ([ConsoleColor]::Yellow)
    Write-Ui "  Plain text sends to the active chat thread."
    Write-Ui "  /poll                 refresh active chat"
    Write-Ui "  /group                switch to group chat"
    Write-Ui "  /dm <recipient_id>    switch to a DM"
    Write-Ui "  /status               show bridge status"
    Write-Ui "  /admin                enter raw admin shell mode"
    Write-Ui "  /chat                 return from admin shell to chat"
    Write-Ui "  /quit                 exit"
    Write-Ui ""
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

    Show-Help
    Write-Ui "Opening $Port at $BaudRate baud..." ([ConsoleColor]::Yellow)
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

        if ([Console]::KeyAvailable) {
            $key = [Console]::ReadKey($true)

            if ($key.Key -eq [ConsoleKey]::Enter) {
                Write-Host ""
                $line = $script:inputBuffer
                $script:inputBuffer = ""
                Process-InputLine $line
            } elseif ($key.Key -eq [ConsoleKey]::Backspace) {
                if ($script:inputBuffer.Length -gt 0) {
                    $script:inputBuffer = $script:inputBuffer.Substring(0, $script:inputBuffer.Length - 1)
                    Write-Host -NoNewline "`b `b"
                }
            } elseif ($key.Key -eq [ConsoleKey]::Tab) {
                if ($script:currentMode -eq "group" -and -not [string]::IsNullOrWhiteSpace($script:dmRecipientUserId)) {
                    Enter-BridgeMode "dm" $script:dmRecipientUserId
                } else {
                    Enter-BridgeMode "group"
                }
            } elseif ($key.KeyChar -and -not [char]::IsControl($key.KeyChar)) {
                $script:inputBuffer += $key.KeyChar
                Write-Host -NoNewline $key.KeyChar
            }
        } elseif ($script:inputBuffer.Length -eq 0) {
            Write-Host -NoNewline (Get-Prompt)
            Start-Sleep -Milliseconds 120
            if ($script:inputBuffer.Length -eq 0) {
                Write-Host -NoNewline "`r"
                Write-Host -NoNewline (" " * ([Math]::Min(80, (Get-Prompt).Length)))
                Write-Host -NoNewline "`r"
            }
        } else {
            Start-Sleep -Milliseconds 60
        }
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
    if ($script:serial -and $script:serial.IsOpen) {
        $script:serial.Close()
    }
}
