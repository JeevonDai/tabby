#Requires -Version 7.0

[CmdletBinding()]
param (
    [ValidatePattern('^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$')]
    [string]$Version = '1.0.235'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repoRoot = [System.IO.Path]::GetFullPath($PSScriptRoot)
$outputDirectory = [System.IO.Path]::GetFullPath((Join-Path $repoRoot 'dist-installer'))
$electronDist = [System.IO.Path]::GetFullPath((Join-Path $repoRoot '.tmp\electron-dist-r14'))
$packager = Join-Path $repoRoot '.agents\skills\package-tabby-windows\scripts\package_tabby_windows.ps1'

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = [Security.Principal.WindowsPrincipal]::new($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host 'Requesting administrator privileges for MSBuild and packaging...' -ForegroundColor Yellow
    $process = Start-Process -FilePath 'pwsh.exe' -Verb RunAs -Wait -PassThru -ArgumentList @(
        '-NoProfile',
        '-ExecutionPolicy', 'Bypass',
        '-File', ('"{0}"' -f $PSCommandPath),
        '-Version', $Version
    )
    exit $process.ExitCode
}

if (Get-Process -Name 'Tabby' -ErrorAction SilentlyContinue) {
    throw 'Close all running Tabby windows before building; they lock app.asar in old installer directories.'
}

function Assert-ChildPath {
    param ([Parameter(Mandatory)][string]$Path)

    $resolved = [System.IO.Path]::GetFullPath($Path)
    $prefix = $repoRoot.TrimEnd('\') + '\'
    if (-not $resolved.StartsWith($prefix, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to remove a path outside the repository: $resolved"
    }
    return $resolved
}

function Remove-BuildDirectory {
    param (
        [Parameter(Mandatory)][string]$Path,
        [switch]$AllowLocked
    )

    $resolved = Assert-ChildPath $Path
    if (-not (Test-Path -LiteralPath $resolved)) {
        return $true
    }

    for ($attempt = 1; $attempt -le 5; $attempt++) {
        try {
            Write-Host "Removing $resolved (attempt $attempt/5)" -ForegroundColor DarkYellow
            Remove-Item -LiteralPath $resolved -Recurse -Force
            return $true
        } catch {
            if ($attempt -lt 5) {
                Start-Sleep -Milliseconds 750
            }
        }
    }

    # A locked file can often remain open while its parent directory is renamed.
    # Move it out of the build namespace so it cannot block or contaminate a new build.
    $pendingRoot = Assert-ChildPath (Join-Path $repoRoot '.tmp\pending-installer-deletes')
    New-Item -ItemType Directory -Force -Path $pendingRoot | Out-Null
    $pendingName = '{0}-{1:yyyyMMddHHmmssfff}' -f ([IO.Path]::GetFileName($resolved)), (Get-Date)
    $pendingPath = Assert-ChildPath (Join-Path $pendingRoot $pendingName)
    try {
        Move-Item -LiteralPath $resolved -Destination $pendingPath
        Write-Warning "Moved locked directory to pending cleanup: $pendingPath"
        return $true
    } catch {
        if ($AllowLocked) {
            Write-Warning "Could not remove locked old build; continuing: $resolved ($($_.Exception.Message))"
            return $false
        }
        throw "Could not remove required output directory: $resolved. Close the process locking app.asar and retry. $($_.Exception.Message)"
    }
}

# Retry leftovers that were renamed during an earlier build. Failure here is harmless.
$pendingRoot = Assert-ChildPath (Join-Path $repoRoot '.tmp\pending-installer-deletes')
if (Test-Path -LiteralPath $pendingRoot) {
    foreach ($pending in Get-ChildItem -LiteralPath $pendingRoot -Directory -ErrorAction SilentlyContinue) {
        [void](Remove-BuildDirectory -Path $pending.FullName -AllowLocked)
    }
}

# Remove the old numbered installer outputs requested for this repository only.
foreach ($revision in 1..23) {
    $oldOutput = Assert-ChildPath (Join-Path $repoRoot "dist-1.0.235-r$revision")
    [void](Remove-BuildDirectory -Path $oldOutput -AllowLocked)
}

# The package workflow intentionally refuses to overwrite output directories,
# so replace the fixed output directory before each new build.
$outputDirectory = Assert-ChildPath $outputDirectory
[void](Remove-BuildDirectory -Path $outputDirectory)

if (-not (Test-Path -LiteralPath (Join-Path $electronDist 'electron.exe'))) {
    throw "Reusable Electron distribution is missing: $electronDist"
}
if (-not (Test-Path -LiteralPath $packager)) {
    throw "Packaging script is missing: $packager"
}

& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $packager `
    -Version $Version `
    -RepoRoot $repoRoot `
    -OutputDirectory $outputDirectory `
    -ElectronDist $electronDist

if ($LASTEXITCODE -ne 0) {
    throw "Tabby packaging failed with exit code $LASTEXITCODE"
}

$installer = Join-Path $outputDirectory "tabby-$Version-setup-x64.exe"
if (-not (Test-Path -LiteralPath $installer)) {
    throw "Build completed without the expected installer: $installer"
}

$item = Get-Item -LiteralPath $installer
$hash = Get-FileHash -Algorithm SHA256 -LiteralPath $installer
$signature = Get-AuthenticodeSignature -LiteralPath $installer

Write-Host "`nInstaller ready" -ForegroundColor Green
[pscustomobject]@{
    Installer = $item.FullName
    Bytes = $item.Length
    SHA256 = $hash.Hash
    SignatureStatus = $signature.Status
} | Format-List
