#Requires -Version 5.1
<#
.SYNOPSIS
    构建 Tabby 插件并部署到 Tabby 安装目录。

.DESCRIPTION
    1. 在 tabby-<plugin> 目录执行 npm run build（即 webpack）
    2. 将 dist/、src/、package.json 同步到 Tabby 内置插件目录
    3. 将所选插件的 dist/index.js 打包为可直接解压到 Tabby 安装根目录的 ZIP
    4. 目标路径可写时无需管理员权限；写入 Program Files 等受保护目录时自动请求 UAC

.PARAMETER Plugin
    要部署的插件名称（不含 tabby- 前缀），例如 settings、core、electron。
    可以同时指定多个（逗号分隔），例如 -Plugin core,settings,terminal。
    也支持传入完整目录名 tabby-settings。
    留空或设为 all 时部署仓库内全部内置插件。

.PARAMETER TabbyPath
    Tabby 安装根目录。默认自动检测 %LOCALAPPDATA%\Tabby 和 C:\Program Files\Tabby，
    优先使用前者。

.PARAMETER SkipBuild
    跳过构建，仅同步已有 dist 产物。

.PARAMETER PackagePath
    构建产物压缩包路径。默认为仓库根目录下的“自带插件.zip”。

.EXAMPLE
    .\scripts\deploy-plugins.ps1 -Plugin settings

.EXAMPLE
    .\scripts\deploy-plugins.ps1 -Plugin core,settings,terminal,electron

.EXAMPLE
    .\scripts\deploy-plugins.ps1 -Plugin telnet -SkipBuild

.EXAMPLE
    .\scripts\deploy-plugins.ps1 -Plugin settings -TabbyPath "$env:LOCALAPPDATA\Tabby"

.EXAMPLE
    .\scripts\deploy-plugins.ps1 -Plugin "settings, telnet, terminal, core, electron, ssh"
#>
param(
    [string]$Plugin = 'settings',
    [string]$TabbyPath = '',
    [switch]$SkipBuild,
    [string]$PackagePath = ''
)

$ErrorActionPreference = 'Stop'

$RepoRoot = Split-Path $PSScriptRoot -Parent

function Resolve-TabbyPath {
    param([string]$ExplicitPath)

    if ($ExplicitPath) {
        # 展开环境变量（如 $env:LOCALAPPDATA 这类在参数字符串中不会被自动展开）
        $expanded = [Environment]::ExpandEnvironmentVariables($ExplicitPath)
        if (Test-Path $expanded) {
            return $expanded
        }
        throw "指定的 Tabby 路径不存在: $expanded"
    }

    # 自动检测
    $candidates = @(
        [Environment]::ExpandEnvironmentVariables('%LOCALAPPDATA%\Tabby'),
        'C:\Program Files\Tabby'
    )

    foreach ($c in $candidates) {
        if (Test-Path $c) {
            Write-Host "检测到 Tabby 安装路径: $c" -ForegroundColor DarkGray
            return $c
        }
    }

    throw "未找到 Tabby 安装目录。请通过 -TabbyPath 指定路径。`n已搜索: $($candidates -join ', ')"
}

function Test-IsAdmin {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Test-NeedsElevation {
    param([string]$Path)

    # Program Files 和系统目录需要管理员权限
    if ($Path -match '^C:\\Program Files') { return $true }
    if ($Path -match '^C:\\Program Files \(x86\)') { return $true }
    if ($Path -match '^C:\\Windows') { return $true }

    # 用户目录（LocalAppData、AppData、UserProfile）不需要
    return $false
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

function Get-BuiltinPluginNames {
    $names = @()
    Get-ChildItem -Path $RepoRoot -Directory -Filter 'tabby-*' | ForEach-Object {
        $pkgPath = Join-Path $_.FullName 'package.json'
        if (-not (Test-Path $pkgPath)) {
            return
        }
        try {
            $pkg = Get-Content $pkgPath -Raw | ConvertFrom-Json
        } catch {
            return
        }
        if ($pkg.keywords -contains 'tabby-builtin-plugin' -and $pkg.scripts.build) {
            $names += $_.Name.Substring(6)
        }
    }
    return $names | Sort-Object -Unique
}

function Normalize-PluginName {
    param([string]$Name)

    $Name = $Name.Trim()
    if ($Name.StartsWith('tabby-')) {
        $Name = $Name.Substring(6)
    }
    return $Name
}

function Invoke-BuildPlugin {
    param(
        [string]$PluginName
    )

    $PluginRoot = Join-Path $RepoRoot "tabby-$PluginName"

    if (-not (Test-Path $PluginRoot)) {
        throw "未找到 tabby-$PluginName 目录: $PluginRoot"
    }

    Write-Host "正在构建 tabby-$PluginName..." -ForegroundColor Cyan
    Push-Location $PluginRoot
    try {
        npm run build
        if ($LASTEXITCODE -ne 0) {
            throw "npm run build 失败，退出码 $LASTEXITCODE"
        }
    } finally {
        Pop-Location
    }

    $DistIndex = Join-Path $PluginRoot 'dist\index.js'
    if (-not (Test-Path $DistIndex)) {
        throw "构建完成但未找到 $DistIndex"
    }
    Write-Host "tabby-$PluginName 构建成功。" -ForegroundColor Green
}

function Invoke-DeployPlugin {
    param(
        [string]$PluginName,
        [string]$BasePath
    )

    $SourceRoot = Join-Path $RepoRoot "tabby-$PluginName"
    $DestinationRoot = Join-Path $BasePath "resources\builtin-plugins\tabby-$PluginName"

    Write-Host "部署 tabby-$PluginName 到: $DestinationRoot" -ForegroundColor Cyan
    Invoke-RobocopyMirror (Join-Path $SourceRoot 'dist') (Join-Path $DestinationRoot 'dist')
    Invoke-RobocopyMirror (Join-Path $SourceRoot 'src') (Join-Path $DestinationRoot 'src')
    Copy-Item (Join-Path $SourceRoot 'package.json') (Join-Path $DestinationRoot 'package.json') -Force

    $local = Get-Item (Join-Path $SourceRoot 'dist\index.js')
    $remote = Get-Item (Join-Path $DestinationRoot 'dist\index.js')
    if ($local.Length -ne $remote.Length) {
        throw "部署校验失败: tabby-$PluginName index.js 大小不一致 (本地 $($local.Length) / 目标 $($remote.Length))"
    }

    Write-Host "tabby-$PluginName 部署成功。" -ForegroundColor Green
    Write-Host "  文件: $($remote.FullName)"
    Write-Host "  大小: $($remote.Length) 字节"
    Write-Host "  时间: $($remote.LastWriteTime)"
}

function New-PluginPackage {
    param(
        [string[]]$PluginNames,
        [string]$OutputPath
    )

    Add-Type -AssemblyName System.IO.Compression.FileSystem

    $outputDirectory = Split-Path $OutputPath -Parent
    if (-not (Test-Path $outputDirectory)) {
        New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
    }
    if (Test-Path -LiteralPath $OutputPath) {
        Remove-Item -LiteralPath $OutputPath -Force
    }

    $archive = [System.IO.Compression.ZipFile]::Open(
        $OutputPath,
        [System.IO.Compression.ZipArchiveMode]::Create
    )
    try {
        foreach ($pluginName in $PluginNames) {
            $source = Join-Path $RepoRoot "tabby-$pluginName\dist\index.js"
            if (-not (Test-Path -LiteralPath $source)) {
                throw "打包失败，未找到构建产物: $source"
            }

            $entryName = "resources/builtin-plugins/tabby-$pluginName/dist/index.js"
            [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
                $archive,
                $source,
                $entryName,
                [System.IO.Compression.CompressionLevel]::Optimal
            ) | Out-Null
        }
    } finally {
        $archive.Dispose()
    }

    $package = Get-Item -LiteralPath $OutputPath
    Write-Host "`n构建产物已打包。" -ForegroundColor Green
    Write-Host "  文件: $($package.FullName)"
    Write-Host "  大小: $($package.Length) 字节"
    Write-Host "  用法: 解压到 Tabby 安装根目录并覆盖同名文件"
}

# 解析插件列表
$ValidPlugins = @(Get-BuiltinPluginNames)
if ($ValidPlugins.Count -eq 0) {
    Write-Error '未在仓库中找到可部署的内置插件（tabby-* 且含 build 脚本）。'
    exit 1
}

if (-not $Plugin -or ($Plugin.Trim() -eq 'all')) {
    $PluginList = $ValidPlugins
} else {
    $PluginList = $Plugin -split '[,\s]+' |
    ForEach-Object { Normalize-PluginName $_ } |
    Where-Object { $_ }
}

# 验证插件名称
foreach ($p in $PluginList) {
    if ($p -notin $ValidPlugins) {
        Write-Error "不支持的插件: $p`n当前支持的插件: $($ValidPlugins -join ', ')"
        exit 1
    }
}

$ResolvedPackagePath = if ([IO.Path]::IsPathRooted($PackagePath)) {
    [IO.Path]::GetFullPath($PackagePath)
} elseif ($PackagePath) {
    [IO.Path]::GetFullPath((Join-Path $RepoRoot $PackagePath))
} else {
    Join-Path $RepoRoot '自带插件.zip'
}

# 解析目标路径
$ResolvedTabbyPath = Resolve-TabbyPath -ExplicitPath $TabbyPath

# 仅在目标目录需要时才提权（Program Files 等系统目录）
if ((Test-NeedsElevation -Path $ResolvedTabbyPath) -and -not (Test-IsAdmin)) {
    Write-Host "目标路径 $ResolvedTabbyPath 需要管理员权限，正在请求 UAC..." -ForegroundColor Yellow
    $argList = @(
        '-NoProfile',
        '-ExecutionPolicy', 'Bypass',
        '-File', $PSCommandPath,
        '-Plugin', $Plugin,
        '-TabbyPath', $ResolvedTabbyPath,
        '-PackagePath', $ResolvedPackagePath
    )
    if ($SkipBuild) {
        $argList += '-SkipBuild'
    }
    Start-Process -FilePath 'powershell.exe' -Verb RunAs -Wait -ArgumentList $argList
    exit $LASTEXITCODE
}

# 检查 Tabby 是否运行
$tabby = Get-Process -Name 'Tabby' -ErrorAction SilentlyContinue
if ($tabby) {
    Write-Warning '检测到 Tabby 正在运行，建议先完全退出再部署，否则 dist\index.js 可能被占用。'
}

try {
    foreach ($p in $PluginList) {
        if (-not $SkipBuild) {
            Invoke-BuildPlugin -PluginName $p
        } else {
            $DistIndex = Join-Path $RepoRoot "tabby-$p\dist\index.js"
            if (-not (Test-Path $DistIndex)) {
                throw "未找到 $DistIndex，请先构建或去掉 -SkipBuild"
            }
        }
        Invoke-DeployPlugin -PluginName $p -BasePath $ResolvedTabbyPath
    }

    New-PluginPackage -PluginNames $PluginList -OutputPath $ResolvedPackagePath
    Write-Host "`n全部部署完成，请完全退出 Tabby 后重新启动以加载新插件。" -ForegroundColor Yellow
} catch {
    Write-Error $_.Exception.Message
    exit 1
}
