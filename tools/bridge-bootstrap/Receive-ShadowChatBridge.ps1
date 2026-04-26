[CmdletBinding()]
param(
    [string]$Port = "",
    [string]$Output = "."
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$encoding = [System.Text.UTF8Encoding]::new($false)

function Read-BridgeFrame {
    param([string]$Line)

    if (-not $Line.StartsWith("@scb:")) {
        return $null
    }

    try {
        return $Line.Substring(5) | ConvertFrom-Json
    } catch {
        return $null
    }
}

function Test-BridgePort {
    param([string]$Name)

    $serial = [System.IO.Ports.SerialPort]::new($Name, 115200, [System.IO.Ports.Parity]::None, 8, [System.IO.Ports.StopBits]::One)
    $serial.Encoding = $encoding
    $serial.NewLine = "`n"
    $serial.ReadBufferSize = 1048576
    $serial.ReadTimeout = 250
    $serial.WriteTimeout = 1000
    $serial.DtrEnable = $true
    $serial.RtsEnable = $true

    try {
        $serial.Open()
        Start-Sleep -Milliseconds 900
        $serial.DiscardInBuffer()
        $serial.WriteLine("bootstrap ping")
        $deadline = [DateTime]::UtcNow.AddSeconds(3)
        while ([DateTime]::UtcNow -lt $deadline) {
            try {
                if ($serial.ReadLine() -match "SHADOWCHAT_BRIDGE_READY") {
                    return $serial
                }
            } catch [System.TimeoutException] {
            }
        }
    } catch {
    }

    if ($serial.IsOpen) {
        $serial.Close()
    }
    $serial.Dispose()
    return $null
}

function Open-BridgePort {
    param([string]$Requested)

    $ports = if (-not [string]::IsNullOrWhiteSpace($Requested)) {
        @($Requested)
    } else {
        [System.IO.Ports.SerialPort]::GetPortNames() | Sort-Object
    }

    foreach ($candidate in $ports) {
        Write-Host "Checking $candidate..."
        $open = Test-BridgePort -Name $candidate
        if ($open) {
            Write-Host "Using $candidate"
            return $open
        }
    }

    throw "Could not find the ShadowChat ESP bridge serial port. Open a serial console and run bootstrap help."
}

$serial = $null
$stream = $null
$path = ""
$expectedSha256 = ""
$expectedSequence = 0

try {
    New-Item -ItemType Directory -Force -Path $Output | Out-Null
    $serial = Open-BridgePort -Requested $Port
    $serial.DiscardInBuffer()
    $serial.WriteLine("bundle get windows_bundle")
    $deadline = [DateTime]::UtcNow.AddMinutes(15)

    while ($true) {
        if ([DateTime]::UtcNow -gt $deadline) {
            throw "Timed out waiting for bundle transfer."
        }

        try {
            $line = $serial.ReadLine().TrimEnd("`r", "`n")
        } catch [System.TimeoutException] {
            continue
        }

        $frame = Read-BridgeFrame -Line $line
        if ($null -eq $frame) {
            if ($line) {
                Write-Host $line
            }
            continue
        }

        if ($frame.type -eq "bundleStart") {
            $fileName = if ($frame.filename) {
                [System.IO.Path]::GetFileName([string]$frame.filename)
            } else {
                "shadowchat-bridge-tools.zip"
            }
            $path = Join-Path $Output $fileName
            $expectedSha256 = [string]$frame.sha256
            $expectedSequence = 0
            $stream = [System.IO.File]::Open($path, [System.IO.FileMode]::Create, [System.IO.FileAccess]::Write)
            Write-Host "Receiving $fileName to $path"
        } elseif ($frame.type -eq "bundleChunk") {
            if ($null -eq $stream) {
                throw "Received data before transfer start."
            }
            if ([int]$frame.seq -ne $expectedSequence) {
                throw "Unexpected chunk $($frame.seq), expected $expectedSequence"
            }
            $data = [Convert]::FromBase64String([string]$frame.data)
            $stream.Write($data, 0, $data.Length)
            $expectedSequence++
        } elseif ($frame.type -eq "bundleEnd") {
            if ($stream) {
                $stream.Dispose()
                $stream = $null
            }
            if (-not [bool]$frame.ok) {
                throw "Bridge transfer failed: $($frame.message)"
            }
            $actual = (Get-FileHash -Algorithm SHA256 -LiteralPath $path).Hash.ToLowerInvariant()
            if ($expectedSha256 -and $actual -ne $expectedSha256.ToLowerInvariant()) {
                throw "SHA mismatch. Expected $expectedSha256 got $actual"
            }
            Write-Host "Transfer complete: $path"
            Write-Host "SHA256: $actual"
            break
        }
    }
} finally {
    if ($stream) {
        $stream.Dispose()
    }
    if ($serial) {
        if ($serial.IsOpen) {
            $serial.Close()
        }
        $serial.Dispose()
    }
}
