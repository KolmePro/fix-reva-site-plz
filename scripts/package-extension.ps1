param(
    [string]$OutputPath = "",
    [string]$ExpectedVersion = ""
)

$ErrorActionPreference = "Stop"

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$manifestPath = Join-Path $repositoryRoot "manifest.json"
$manifest = Get-Content -Raw -Encoding UTF8 -LiteralPath $manifestPath | ConvertFrom-Json

if ($ExpectedVersion -and $manifest.version -ne $ExpectedVersion) {
    throw "Manifest version '$($manifest.version)' does not match release version '$ExpectedVersion'."
}

$contentScripts = @(
    $manifest.content_scripts |
        ForEach-Object { $_.js } |
        Sort-Object -Unique
)

foreach ($scriptName in $contentScripts) {
    $scriptPath = Join-Path $repositoryRoot $scriptName
    if (-not (Test-Path -LiteralPath $scriptPath -PathType Leaf)) {
        throw "Content script '$scriptName' from manifest.json does not exist."
    }
}

if (-not $OutputPath) {
    $OutputPath = Join-Path $repositoryRoot "dist/fix-reva-site-plz-$($manifest.version).zip"
} elseif (-not [System.IO.Path]::IsPathRooted($OutputPath)) {
    $OutputPath = Join-Path $repositoryRoot $OutputPath
}

$outputFullPath = [System.IO.Path]::GetFullPath($OutputPath)
$outputDirectory = Split-Path -Parent $outputFullPath
$temporaryDirectory = Join-Path ([System.IO.Path]::GetTempPath()) "fix-reva-site-plz-$([guid]::NewGuid())"

New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null
New-Item -ItemType Directory -Path $temporaryDirectory | Out-Null

try {
    Copy-Item -LiteralPath $manifestPath -Destination $temporaryDirectory

    foreach ($scriptName in $contentScripts) {
        Copy-Item -LiteralPath (Join-Path $repositoryRoot $scriptName) -Destination $temporaryDirectory
    }

    if (Test-Path -LiteralPath $outputFullPath) {
        Remove-Item -LiteralPath $outputFullPath -Force
    }

    Add-Type -AssemblyName System.IO.Compression.FileSystem
    [System.IO.Compression.ZipFile]::CreateFromDirectory(
        $temporaryDirectory,
        $outputFullPath,
        [System.IO.Compression.CompressionLevel]::Optimal,
        $false
    )
} finally {
    if (Test-Path -LiteralPath $temporaryDirectory) {
        Remove-Item -LiteralPath $temporaryDirectory -Recurse -Force
    }
}

Write-Output "Created Chrome extension package: $outputFullPath"
Write-Output "Version: $($manifest.version)"
