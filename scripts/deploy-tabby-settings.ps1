#Requires -Version 5.1
<#
.SYNOPSIS
    构建 tabby-settings 并部署到 Tabby 安装目录。

.DESCRIPTION
    1. 在 tabby-settings 目录执行 npm run build
    2. 将 dist/、src/、package.json 同步到 Tabby 内置插件目录
    3. 写入 Program Files 需要管理员权限（脚本会自动请求 UAC）

.PARAMETER TabbyPluginPath
    目标插件路径，默认为 Tabby 默认安装位置。

.PARAMETER SkipBuild
    跳过构建，仅同步已有 dist 产物。

.EXAMPLE
    .\scripts\deploy-tabby-settings.ps1

.EXAMPLE
    .\scripts\deploy-tabby-settings.ps1 -SkipBuild
#>
param(
    [string]$TabbyPluginPath = 'C:\Program Files\Tabby\resources\builtin-plugins\tabby-settings',
    [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'

$RepoRoot = Split-Path $PSScriptRoot -Parent
$SettingsRoot = Join-Path $RepoRoot 'tabby-settings'
$DistIndex = Join-Path $SettingsRoot 'dist\index.js'

function Test-IsAdmin {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Invoke-RobocopyMirror {
    param(
        [string]$Source,
        [string]$Destination
    )
    if (-not (Test-Path $Source)) {
        throw "源目录不存在: $Source"
    }
    if (-not (Test-Path $Destination)) {
        New-Item -ItemType Directory -Path $Destination -Force | Out-Null
    }
    & robocopy $Source $Destination /MIR /NFL /NDL /NJH /NJS | Out-Null
    if ($LASTEXITCODE -ge 8) {
        throw "robocopy 失败 ($Source -> $Destination)，退出码 $LASTEXITCODE"
    }
}

function Invoke-Deploy {
    param(
        [string]$SourceRoot,
        [string]$DestinationRoot
    )

    if (-not (Test-Path $DestinationRoot)) {
        throw "Tabby 插件目录不存在: $DestinationRoot`n请确认 Tabby 已安装，或通过 -TabbyPluginPath 指定路径。"
    }

    $tabby = Get-Process -Name 'Tabby' -ErrorAction SilentlyContinue
    if ($tabby) {
        Write-Warning '检测到 Tabby 正在运行，建议先完全退出再部署，否则 dist\index.js 可能被占用。'
    }

    Write-Host "部署到: $DestinationRoot" -ForegroundColor Cyan
    Invoke-RobocopyMirror (Join-Path $SourceRoot 'dist') (Join-Path $DestinationRoot 'dist')
    Invoke-RobocopyMirror (Join-Path $SourceRoot 'src') (Join-Path $DestinationRoot 'src')
    Copy-Item (Join-Path $SourceRoot 'package.json') (Join-Path $DestinationRoot 'package.json') -Force

    $local = Get-Item $DistIndex
    $remote = Get-Item (Join-Path $DestinationRoot 'dist\index.js')
    if ($local.Length -ne $remote.Length) {
        throw "部署校验失败: index.js 大小不一致 (本地 $($local.Length) / 目标 $($remote.Length))"
    }

    Write-Host '部署成功。' -ForegroundColor Green
    Write-Host "  文件: $($remote.FullName)"
    Write-Host "  大小: $($remote.Length) 字节"
    Write-Host "  时间: $($remote.LastWriteTime)"
    Write-Host '请完全退出 Tabby 后重新启动以加载新插件。' -ForegroundColor Yellow
}

function Invoke-Build {
    if (-not (Test-Path $SettingsRoot)) {
        throw "未找到 tabby-settings 目录: $SettingsRoot"
    }
    Write-Host '正在构建 tabby-settings...' -ForegroundColor Cyan
    Push-Location $SettingsRoot
    try {
        npm run build
        if ($LASTEXITCODE -ne 0) {
            throw "npm run build 失败，退出码 $LASTEXITCODE"
        }
    } finally {
        Pop-Location
    }
    if (-not (Test-Path $DistIndex)) {
        throw "构建完成但未找到 $DistIndex"
    }
    Write-Host '构建成功。' -ForegroundColor Green
}

# 非管理员时，以提升权限重新启动本脚本
if (-not (Test-IsAdmin)) {
    Write-Host '需要管理员权限写入 Program Files，正在请求 UAC...' -ForegroundColor Yellow
    $argList = @(
        '-NoProfile',
        '-ExecutionPolicy', 'Bypass',
        '-File', $PSCommandPath,
        '-TabbyPluginPath', ('"' + $TabbyPluginPath + '"')
    )
    if ($SkipBuild) {
        $argList += '-SkipBuild'
    }
    Start-Process -FilePath 'powershell.exe' -Verb RunAs -Wait -ArgumentList $argList
    exit $LASTEXITCODE
}

try {
    if (-not $SkipBuild) {
        Invoke-Build
    } elseif (-not (Test-Path $DistIndex)) {
        throw "未找到 $DistIndex，请先构建或去掉 -SkipBuild"
    }

    Invoke-Deploy -SourceRoot $SettingsRoot -DestinationRoot $TabbyPluginPath
} catch {
    Write-Error $_.Exception.Message
    exit 1
}
