$ErrorActionPreference = 'Stop'
$checkersRepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '../../..')).Path
$checkersOutput = Join-Path $checkersRepoRoot 'public/games/shadow-checkers/audio'

# CC0 Kenney light contacts: a muted body with a small hard-surface tick.
# Keep headroom rather than normalizing every tiny transient to full scale.
foreach ($checkersIndex in 0..3) {
    $checkersWood = Join-Path $PSScriptRoot ('Audio/impactWood_light_{0:000}.ogg' -f $checkersIndex)
    $checkersGlass = Join-Path $PSScriptRoot ('Audio/impactGlass_light_{0:000}.ogg' -f $checkersIndex)
    $checkersFilter = '[0:a]silenceremove=start_periods=1:start_duration=0.001:start_threshold=-45dB,atrim=duration=0.27,asetpts=PTS-STARTPTS,highpass=f=170,lowpass=f=3200,acompressor=threshold=0.08:ratio=3:attack=2:release=50,afade=t=in:d=0.004,afade=t=out:st=0.12:d=0.15,volume=0.65[body];[1:a]silenceremove=start_periods=1:start_duration=0.001:start_threshold=-45dB,atrim=duration=0.21,asetpts=PTS-STARTPTS,highpass=f=500,lowpass=f=2400,afade=t=in:d=0.003,afade=t=out:st=0.06:d=0.15,volume=0.18[tick];[body][tick]amix=inputs=2:normalize=0,volume=2.5,alimiter=limit=0.35:level=0,apad=pad_dur=0.06,atrim=duration=0.34'
    & ffmpeg -hide_banner -loglevel error -y -i $checkersWood -i $checkersGlass -filter_complex $checkersFilter -ac 1 -ar 44100 -codec:a libmp3lame -q:a 3 (Join-Path $checkersOutput "stone-place-$checkersIndex.mp3")
    if ($LASTEXITCODE -ne 0) { throw "Contact $checkersIndex encoding failed" }
}

# Preserve the original recording in ArtSource; ship a smaller stereo phone copy.
& ffmpeg -hide_banner -loglevel error -y -i (Join-Path $PSScriptRoot 'Audio/heart-of-courage-master.mp3') -map 0:a:0 -codec:a libmp3lame -b:a 128k -ar 44100 (Join-Path $checkersOutput 'heart-of-courage.mp3')
if ($LASTEXITCODE -ne 0) { throw 'Original soundtrack delivery encoding failed' }
