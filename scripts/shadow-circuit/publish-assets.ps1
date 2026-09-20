param([switch]$Publish)
$ErrorActionPreference = 'Stop'
if (-not $Publish) { throw 'Use -Publish only for an authorized game asset release.' }
$repo = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$base = 'https://shsqqouecvdoifzufkqm.supabase.co/storage/v1'
$bucket = 'game-assets'
# Capture credentials in memory only; never write them into files or CLI logs.
$rawKeys = & npx supabase projects api-keys --project-ref shsqqouecvdoifzufkqm --output json 2>$null
if ($LASTEXITCODE -ne 0) { throw 'Supabase CLI authentication is required.' }
$keys = ($rawKeys -join "`n") | ConvertFrom-Json
$credential = ($keys | Where-Object name -eq 'service_role').api_key
if (-not $credential) { throw 'No server upload credential is available.' }
$headers = @{Authorization="Bearer $credential"; apikey=$credential}
$buckets = Invoke-RestMethod "$base/bucket" -Headers $headers
$existing = $buckets | Where-Object id -eq $bucket
if (-not $existing) {
    $body = @{id=$bucket;name=$bucket;public=$true;file_size_limit=4000000;allowed_mime_types=@('application/octet-stream','audio/mpeg','audio/midi')} | ConvertTo-Json
    Invoke-RestMethod "$base/bucket" -Method Post -Headers $headers -ContentType 'application/json' -Body $body | Out-Null
} elseif (-not $existing.public) { throw 'Existing game-assets bucket is not public; refusing to change it.' }
$models = @(); $original = @{}
$entries = @()
Get-ChildItem -LiteralPath (Join-Path $repo 'src/features/games/shadow-circuit/assets/classic') -Filter '*.glbz' | ForEach-Object {
    $entries += @{file=$_;kind='model';mime='application/octet-stream'}
}
Get-ChildItem -LiteralPath (Join-Path $repo 'assets-source/shadow-circuit/original-authorized') -File | Where-Object Extension -in @('.dat','.mid','.mp3') | ForEach-Object {
    $entries += @{file=$_;kind='original';mime=$(if ($_.Extension -eq '.mp3') {'audio/mpeg'} elseif ($_.Extension -eq '.mid') {'audio/midi'} else {'application/octet-stream'})}
}
foreach ($entry in $entries) {
    $file = $entry.file
    $hash = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
    $path = "shadow-circuit/$hash/$($file.Name.ToLowerInvariant())"
    $uploadHeaders = $headers.Clone();$uploadHeaders['x-upsert']='true';$uploadHeaders['cache-control']='31536000'
    Invoke-RestMethod "$base/object/$bucket/$path" -Method Post -Headers $uploadHeaders -ContentType $entry.mime -InFile $file.FullName | Out-Null
    $record = @{url="$base/object/public/$bucket/$path";sha256=$hash;bytes=$file.Length}
    if ($entry.kind -eq 'model') { $record.id=$file.BaseName;$models += $record } else { $original[$file.Name.ToLowerInvariant()]=$record }
}
$manifest = @{version=3;models=$models;original=$original} | ConvertTo-Json -Depth 6
$manifestPath=Join-Path $repo 'src/features/games/shadow-circuit/content/assetManifest.json'
[IO.File]::WriteAllText($manifestPath, $manifest+"`n", [Text.UTF8Encoding]::new($false))
$credential=$null;$headers=$null;$keys=$null;$rawKeys=$null
Write-Output "Published $($models.Count) models and $($original.Count) original campaign/music assets."
