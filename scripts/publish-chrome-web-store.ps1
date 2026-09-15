param(
    [Parameter(Mandatory = $true)]
    [string]$AccessToken,

    [Parameter(Mandatory = $true)]
    [string]$PublisherId,

    [Parameter(Mandatory = $true)]
    [string]$ExtensionId,

    [string]$PackagePath = "",

    [switch]$ValidateOnly
)

$ErrorActionPreference = "Stop"

$itemName = "publishers/$PublisherId/items/$ExtensionId"
$apiBase = "https://chromewebstore.googleapis.com"
$headers = @{ Authorization = "Bearer $AccessToken" }

function Get-ItemStatus {
    Invoke-RestMethod `
        -Method Get `
        -Uri "$apiBase/v2/${itemName}:fetchStatus" `
        -Headers $headers
}

function Test-UploadInProgress([string]$State) {
    return $State -in @("IN_PROGRESS", "UPLOAD_IN_PROGRESS")
}

function Test-UploadSucceeded([string]$State) {
    return $State -in @("SUCCEEDED", "UPLOAD_SUCCESS")
}

$status = Get-ItemStatus
Write-Output "Chrome Web Store API access confirmed for item $($status.itemId)."

if ($ValidateOnly) {
    exit 0
}

if (-not $PackagePath) {
    throw "PackagePath is required when ValidateOnly is not set."
}

$packageFullPath = [System.IO.Path]::GetFullPath($PackagePath)
if (-not (Test-Path -LiteralPath $packageFullPath -PathType Leaf)) {
    throw "Extension package not found: $packageFullPath"
}

$upload = Invoke-RestMethod `
    -Method Post `
    -Uri "$apiBase/upload/v2/${itemName}:upload" `
    -Headers $headers `
    -ContentType "application/zip" `
    -InFile $packageFullPath

$uploadState = $upload.uploadState
Write-Output "Upload state: $uploadState"

if (Test-UploadInProgress $uploadState) {
    for ($attempt = 1; $attempt -le 24; $attempt++) {
        Start-Sleep -Seconds 5
        $status = Get-ItemStatus
        $uploadState = $status.lastAsyncUploadState
        Write-Output "Upload status check ${attempt}: $uploadState"

        if (-not (Test-UploadInProgress $uploadState)) {
            break
        }
    }
}

if (-not (Test-UploadSucceeded $uploadState)) {
    throw "Chrome Web Store package upload failed or timed out with state '$uploadState'."
}

$publishBody = @{
    publishType = "DEFAULT_PUBLISH"
    blockOnWarnings = $true
} | ConvertTo-Json

$publication = Invoke-RestMethod `
    -Method Post `
    -Uri "$apiBase/v2/${itemName}:publish" `
    -Headers $headers `
    -ContentType "application/json" `
    -Body $publishBody

Write-Output "Submission state: $($publication.state)"
Write-Output "The extension will be published automatically after Chrome Web Store approval."
