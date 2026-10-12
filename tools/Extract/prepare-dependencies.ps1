# GPL-3.0; see LICENSE. Builds optional extractor dependencies from upstream source.
[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$dependencyRoot = Join-Path $projectRoot 'artifacts\dependencies'
$libraryRoot = Join-Path $projectRoot 'tools\lib'
New-Item -ItemType Directory -Force -Path $dependencyRoot, $libraryRoot | Out-Null
function Run([string]$command, [string[]]$arguments) {
    & $command @arguments
    if ($LASTEXITCODE -ne 0) { throw "$command failed with exit code $LASTEXITCODE" }
}
function Checkout([string]$url, [string]$path, [string]$revision, [string]$subdirectory) {
    if (-not (Test-Path -LiteralPath (Join-Path $path '.git'))) {
        Run 'git' @('clone', '--filter=blob:none', '--no-checkout', $url, $path)
    }
    Run 'git' @('-C', $path, 'sparse-checkout', 'set', $subdirectory)
    Run 'git' @('-C', $path, 'checkout', '--detach', $revision)
}
$current = Join-Path $dependencyRoot 'current'
$legacy = Join-Path $dependencyRoot 'legacy'
Checkout 'https://github.com/JKAnderson/SoulsFormats.git' $current '9c0da6b0721372b34f36b4be503ec020dca1043a' 'SoulsFormats'
Checkout 'https://github.com/Meowmaritus/MVDX_Classic.git' $legacy 'e8696492aaf83f0ece7e5a1887f91b4f928bd91d' 'SoulsFormats'
Run 'dotnet' @('build', (Join-Path $current 'SoulsFormats\SoulsFormats.csproj'), '-c', 'Release', '-p:TargetFrameworks=netstandard2.1')
Run 'dotnet' @('build', (Join-Path $PSScriptRoot 'Legacy.Hkx.csproj'), '-c', 'Release')
Copy-Item -LiteralPath (Join-Path $current 'SoulsFormats\bin\Release\netstandard2.1\SoulsFormats.dll') -Destination $libraryRoot
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'bin\Release\net10.0\SoulsFormats.Modern.dll') -Destination $libraryRoot
Write-Host 'Extractor dependencies ready. Upstream source and licenses remain in artifacts/dependencies.'
