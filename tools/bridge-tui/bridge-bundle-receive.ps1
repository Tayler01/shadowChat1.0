[CmdletBinding()]
param(
    [string]$Port = "COM3",
    [int]$BaudRate = 115200,
    [ValidateSet("windows_bundle", "bootstrap")]
    [string]$Target = "windows_bundle",
    [string]$OutputPath = "",
    [int]$TimeoutSeconds = 900
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$script:utf8NoBom = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = $script:utf8NoBom
$OutputEncoding = $script:utf8NoBom

function Get-DefaultDownloadRoot {
    if ($env:LOCALAPPDATA) {
        return Join-Path $env:LOCALAPPDATA "ShadowChatBridge\downloads"
    }

    return Join-Path $HOME ".shadowchat-bridge\downloads"
}

function Get-SafeFileName {
    param([string]$Name)

    $fallback = "shadowchat-bridge-$Target.bin"
    if ([string]::IsNullOrWhiteSpace($Name)) {
        return $fallback
    }

    $invalid = [System.IO.Path]::GetInvalidFileNameChars()
    $chars = foreach ($char in $Name.ToCharArray()) {
        if ($invalid -contains $char) {
            "_"
        } else {
            [string]$char
        }
    }

    $safe = -join $chars
    if ([string]::IsNullOrWhiteSpace($safe)) {
        return $fallback
    }

    return $safe
}

function Resolve-OutputFile {
    param([string]$RequestedPath, [string]$FileName)

    $safeName = Get-SafeFileName -Name $FileName
    if ([string]::IsNullOrWhiteSpace($RequestedPath)) {
        $root = Get-DefaultDownloadRoot
        New-Item -ItemType Directory -Force -Path $root | Out-Null
        return Join-Path $root $safeName
    }

    $looksLikeDirectory = (
        (Test-Path -LiteralPath $RequestedPath -PathType Container) -or
        $RequestedPath.EndsWith("\") -or
        $RequestedPath.EndsWith("/") -or
        [string]::IsNullOrWhiteSpace([System.IO.Path]::GetExtension($RequestedPath))
    )

    if ($looksLikeDirectory) {
        New-Item -ItemType Directory -Force -Path $RequestedPath | Out-Null
        return Join-Path $RequestedPath $safeName
    }

    $parent = Split-Path -Parent $RequestedPath
    if (-not [string]::IsNullOrWhiteSpace($parent)) {
        New-Item -ItemType Directory -Force -Path $parent | Out-Null
    }

    return $RequestedPath
}

function Read-BridgeFrame {
    param([string]$Line)

    if (-not $Line.StartsWith("@scb:")) {
        return $null
    }

    $jsonText = $Line.Substring(5).Trim()
    if ([string]::IsNullOrWhiteSpace($jsonText)) {
        return $null
    }

    try {
        return $jsonText | ConvertFrom-Json
    } catch {
        Write-Verbose "Ignoring invalid protocol frame: $jsonText"
        return $null
    }
}

$serial = [System.IO.Ports.SerialPort]::new($Port, $BaudRate, [System.IO.Ports.Parity]::None, 8, [System.IO.Ports.StopBits]::One)
$serial.Encoding = $script:utf8NoBom
$serial.NewLine = "`n"
$serial.ReadBufferSize = 1048576
$serial.ReadTimeout = 1000
$serial.WriteTimeout = 3000
$serial.DtrEnable = $true
$serial.RtsEnable = $true

$stream = $null
$finalPath = ""
$expectedSha256 = ""
$expectedSeq = 0
$receivedBytes = 0
$started = $false
$completed = $false
$deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)

try {
    Write-Host "Opening $Port at $BaudRate baud..."
    $serial.Open()
    Start-Sleep -Milliseconds 1500
    $serial.DiscardInBuffer()

    Write-Host "Requesting $Target through the ESP bridge..."
    $serial.WriteLine("bundle get $Target")

    while (-not $completed) {
        if ([DateTime]::UtcNow -gt $deadline) {
            throw "Timed out waiting for $Target transfer to finish."
        }

        try {
            $line = $serial.ReadLine()
        } catch [System.TimeoutException] {
            continue
        }

        $line = $line.TrimEnd("`r", "`n")
        if ([string]::IsNullOrWhiteSpace($line)) {
            continue
        }

        $frame = Read-BridgeFrame -Line $line
        if ($null -eq $frame) {
            Write-Host $line
            continue
        }

        if (-not ($frame.PSObject.Properties.Name -contains "type")) {
            continue
        }

        switch ([string]$frame.type) {
            "bundleStart" {
                if ($started) {
                    throw "Received a second bundleStart frame."
                }

                $started = $true
                $expectedSeq = 0
                $receivedBytes = 0
                $expectedSha256 = if ($frame.PSObject.Properties.Name -contains "sha256") { [string]$frame.sha256 } else { "" }
                $fileName = if ($frame.PSObject.Properties.Name -contains "filename") { [string]$frame.filename } else { "" }
                $finalPath = Resolve-OutputFile -RequestedPath $OutputPath -FileName $fileName
                $stream = [System.IO.File]::Open($finalPath, [System.IO.FileMode]::Create, [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)

                $sizeText = if (($frame.PSObject.Properties.Name -contains "sizeBytes") -and $null -ne $frame.sizeBytes) {
                    "$($frame.sizeBytes) bytes"
                } else {
                    "unknown size"
                }
                Write-Host "Receiving $Target $($frame.version) -> $finalPath ($sizeText)"
            }

            "bundleChunk" {
                if (-not $started -or $null -eq $stream) {
                    throw "Received bundleChunk before bundleStart."
                }

                $seq = [int]$frame.seq
                if ($seq -ne $expectedSeq) {
                    throw "Unexpected chunk sequence $seq; expected $expectedSeq."
                }

                $data = [Convert]::FromBase64String([string]$frame.data)
                $stream.Write($data, 0, $data.Length)
                $receivedBytes += $data.Length
                $expectedSeq++

                if (($expectedSeq % 64) -eq 0) {
                    Write-Host "Received $receivedBytes bytes..."
                }
            }

            "bundleEnd" {
                if ($null -ne $stream) {
                    $stream.Flush()
                    $stream.Dispose()
                    $stream = $null
                }

                $ok = ($frame.PSObject.Properties.Name -contains "ok") -and [bool]$frame.ok
                if (-not $ok) {
                    $message = if ($frame.PSObject.Properties.Name -contains "message") { [string]$frame.message } else { "transfer failed" }
                    throw "Bridge reported failed transfer: $message"
                }

                if ([string]::IsNullOrWhiteSpace($finalPath) -or -not (Test-Path -LiteralPath $finalPath)) {
                    throw "Transfer completed but no output file was created."
                }

                $actualHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $finalPath).Hash.ToLowerInvariant()
                if (-not [string]::IsNullOrWhiteSpace($expectedSha256) -and $actualHash -ne $expectedSha256.ToLowerInvariant()) {
                    throw "Downloaded file hash mismatch. Expected $expectedSha256, got $actualHash."
                }

                $completed = $true
                Write-Host "Transfer complete: $finalPath"
                Write-Host "SHA256: $actualHash"
            }
        }
    }
} finally {
    if ($null -ne $stream) {
        $stream.Dispose()
    }
    if ($serial.IsOpen) {
        $serial.Close()
    }
    $serial.Dispose()
}
