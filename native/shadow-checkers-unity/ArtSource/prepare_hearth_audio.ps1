$ErrorActionPreference = 'Stop'
$hearthRepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '../../..')).Path
$hearthDestination = Join-Path $hearthRepoRoot 'public/games/shadow-checkers/audio/fireplace-loop.mp3'
# Preserve the authored 23-second filtered/crossfaded loop. VBR removes constant
# bitrate overhead while keeping its duration, mono mix, and playback gain.
& ffmpeg -hide_banner -loglevel error -y -i (Join-Path $PSScriptRoot 'Audio/fireplace-loop-master.mp3') -map_metadata -1 -codec:a libmp3lame -q:a 4 $hearthDestination
if ($LASTEXITCODE -ne 0) { throw 'Hearth ambience delivery encoding failed' }
