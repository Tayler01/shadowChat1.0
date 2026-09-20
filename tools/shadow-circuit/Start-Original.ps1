$ErrorActionPreference = 'Stop'
$referenceRoot = Join-Path $PSScriptRoot 'private-originals'
$runtime = Join-Path $referenceRoot 'runtime/otvdm-v0.9.0/otvdmw.exe'
$game = Join-Path $referenceRoot 'game/CHIPS.EXE'
if (!(Test-Path -LiteralPath $runtime) -or !(Test-Path -LiteralPath $game)) {
    throw 'Local reference files are missing. See docs/shadow-circuit/ORIGINAL_REFERENCE.md.'
}
Start-Process -FilePath $runtime -ArgumentList ('"' + $game + '"') -WorkingDirectory (Split-Path $game) -WindowStyle Normal
