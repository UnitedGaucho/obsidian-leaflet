param([string]$VaultPath = (Join-Path $PSScriptRoot '../../map/radiosol-map'))
$ErrorActionPreference = 'Stop'
$vault = (Resolve-Path -LiteralPath $VaultPath).Path
$plugins = Join-Path $vault '.obsidian/plugins'
$target = Join-Path $plugins 'leaflet-local-tiles'
$files = @('main.js', 'styles.css', 'manifest.json', 'main.js.LICENSE.txt', 'LICENSE')
foreach ($name in $files) {
    if (-not (Test-Path -LiteralPath (Join-Path $PSScriptRoot $name))) {
        throw "Missing build output $name. Run npm.cmd run build first."
    }
}
if (Test-Path -LiteralPath $target) {
    $backup = Join-Path $PSScriptRoot ('backups/' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
    New-Item -ItemType Directory -Path $backup -Force | Out-Null
    foreach ($name in $files + @('data.json')) {
        $existing = Join-Path $target $name
        if (Test-Path -LiteralPath $existing) { Copy-Item -LiteralPath $existing -Destination $backup }
    }
}
New-Item -ItemType Directory -Path $target -Force | Out-Null
foreach ($name in $files) {
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot $name) -Destination (Join-Path $target $name) -Force
}
$settings = Join-Path $target 'data.json'
$original = Join-Path $plugins 'obsidian-leaflet-plugin/data.json'
if (-not (Test-Path -LiteralPath $settings) -and (Test-Path -LiteralPath $original)) {
    Copy-Item -LiteralPath $original -Destination $settings
}
$enabledFile = Join-Path $vault '.obsidian/community-plugins.json'
$enabled = @(Get-Content -Raw -LiteralPath $enabledFile | ConvertFrom-Json)
if ($enabled -notcontains 'leaflet-local-tiles') {
    Copy-Item -LiteralPath $enabledFile -Destination (Join-Path $target 'community-plugins-before-install.json')
    $enabled += 'leaflet-local-tiles'
    ConvertTo-Json -InputObject $enabled | Set-Content -LiteralPath $enabledFile -Encoding utf8
}
Write-Output "Installed Leaflet Local Tiles in $target. Restart Obsidian."
