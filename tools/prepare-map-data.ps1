[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$GameRoot)
$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$gameDirectory = (Resolve-Path -LiteralPath $GameRoot).Path
if (-not (Test-Path -LiteralPath (Join-Path $gameDirectory 'map\mapstudio'))) { throw 'GameRoot must be the dvdroot_ps4 folder containing map, msg and param.' }
function Run([string]$command, [string[]]$arguments) {
    & $command @arguments
    if ($LASTEXITCODE -ne 0) { throw "$command failed with exit code $LASTEXITCODE" }
}
Push-Location $projectRoot
try {
    $extractor = Join-Path $PSScriptRoot 'Extract\Extract.csproj'
    Run 'dotnet' @('run', '--project', $extractor, '-c', 'Release', '--', $gameDirectory, 'artifacts/extracted')
    Run 'dotnet' @('run', '--project', $extractor, '-c', 'Release', '--', $gameDirectory, 'artifacts/extracted', '--npc-only')
    $reference = Join-Path $projectRoot 'artifacts\reference'
    New-Item -ItemType Directory -Force -Path $reference | Out-Null
    $areas = @('m21_00_00_00','m24_01_00_00','m24_00_00_00','m23_00_00_00','m22_00_00_00','m21_01_00_00','m27_00_00_00','m32_00_00_00','m28_00_00_00','m25_00_00_00','m24_02_00_00','m33_00_00_00','m26_00_00_00','m34_00_00_00','m35_00_00_00','m36_00_00_00')
    foreach ($area in $areas) {
        $url = "https://raw.githubusercontent.com/Grimrukh/soulstruct-vanilla/e6de1b79370755152f4f89c4a106a2d67c9ae674/bloodborne/events/$area.evs.py"
        Invoke-WebRequest -Uri $url -OutFile (Join-Path $reference "$area.evs.py")
    }
    Run 'python' @('tools/build_data.py')
    Run 'python' @('tools/build_layers.py')
    Write-Host 'Local web/data is ready. Keep generated game data out of Git.'
} finally { Pop-Location }
