#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

PLUGIN="settings"
TABBY_PATH=""
SKIP_BUILD=false
SKIP_DEPS=false
PACKAGE_PATH=""
NO_SIGN=false
PLATFORM="$(uname -s)"
RESOURCES_PATH=""
APP_BUNDLE=""
NEEDS_SUDO=false
TEMP_DIR=""

usage() {
    cat <<'EOF'
构建 Tabby 插件并部署到 Linux 或 macOS 的 Tabby 安装目录。

用法:
  ./scripts/deploy-plugins.sh [选项]

选项:
  -p, --plugin <名称>       插件名称（默认 settings）。多个名称用逗号分隔；all 表示全部
  -t, --tabby-path <路径>   Tabby 安装目录、macOS .app 或 Resources/resources 目录
  -s, --skip-build          跳过构建，仅部署已有 dist 产物
      --skip-deps           构建前不检查或安装插件依赖
  -o, --package-path <路径> ZIP 输出路径（默认仓库根目录/自带插件.zip）
      --no-sign             macOS 上修改 .app 后不执行 ad-hoc 重签名
  -h, --help                显示帮助

示例:
  ./scripts/deploy-plugins.sh --plugin settings
  ./scripts/deploy-plugins.sh --plugin core,settings,terminal,electron
  ./scripts/deploy-plugins.sh --plugin telnet --skip-build
  ./scripts/deploy-plugins.sh --plugin settings --tabby-path /Applications/Tabby.app
  ./scripts/deploy-plugins.sh --plugin settings --tabby-path /opt/Tabby
EOF
}

die() {
    printf '错误: %s\n' "$*" >&2
    exit 1
}

cleanup() {
    if [[ -n "$TEMP_DIR" && -d "$TEMP_DIR" ]]; then
        rm -rf -- "$TEMP_DIR"
    fi
}
trap cleanup EXIT

while (($#)); do
    case "$1" in
        -p|--plugin)
            (($# >= 2)) || die "$1 缺少参数"
            PLUGIN="$2"
            shift 2
            ;;
        -t|--tabby-path)
            (($# >= 2)) || die "$1 缺少参数"
            TABBY_PATH="$2"
            shift 2
            ;;
        -s|--skip-build)
            SKIP_BUILD=true
            shift
            ;;
        --skip-deps)
            SKIP_DEPS=true
            shift
            ;;
        -o|--package-path)
            (($# >= 2)) || die "$1 缺少参数"
            PACKAGE_PATH="$2"
            shift 2
            ;;
        --no-sign)
            NO_SIGN=true
            shift
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        --)
            shift
            break
            ;;
        *)
            die "未知参数: $1（使用 --help 查看帮助）"
            ;;
    esac
done

(($# == 0)) || die "无法识别的位置参数: $*"

case "$PLATFORM" in
    Darwin|Linux) ;;
    *) die "此脚本仅支持 Linux 和 macOS，当前系统: $PLATFORM" ;;
esac

for command_name in node npm rsync zip; do
    command -v "$command_name" >/dev/null 2>&1 || die "未找到命令: $command_name"
done

resolve_resources_path() {
    local candidate="$1"
    local resolved_candidate=""

    if [[ "$candidate" == *.app && -d "$candidate/Contents/Resources" ]]; then
        APP_BUNDLE="$(cd "$candidate" && pwd -P)"
        RESOURCES_PATH="$APP_BUNDLE/Contents/Resources"
    elif [[ -d "$candidate/Contents/Resources" ]]; then
        RESOURCES_PATH="$(cd "$candidate/Contents/Resources" && pwd -P)"
        resolved_candidate="$(cd "$candidate" && pwd -P)"
        [[ "$resolved_candidate" == *.app ]] && APP_BUNDLE="$resolved_candidate"
    elif [[ -d "$candidate/resources" ]]; then
        RESOURCES_PATH="$(cd "$candidate/resources" && pwd -P)"
    elif [[ -d "$candidate/Resources" ]]; then
        RESOURCES_PATH="$(cd "$candidate/Resources" && pwd -P)"
    elif [[ -d "$candidate/builtin-plugins" ]]; then
        RESOURCES_PATH="$(cd "$candidate" && pwd -P)"
    else
        die "路径中未找到 Tabby resources/builtin-plugins: $candidate"
    fi

    [[ -d "$RESOURCES_PATH/builtin-plugins" ]] || \
        die "不是有效的 Tabby 资源目录（缺少 builtin-plugins）: $RESOURCES_PATH"

    if [[ "$PLATFORM" == Darwin && -z "$APP_BUNDLE" && "$RESOURCES_PATH" == *.app/Contents/Resources ]]; then
        APP_BUNDLE="${RESOURCES_PATH%/Contents/Resources}"
    fi
}

detect_tabby_path() {
    local candidate=""
    local executable=""
    local executable_dir=""
    local candidates=()

    if [[ "$PLATFORM" == Darwin ]]; then
        candidates=(
            "$HOME/Applications/Tabby.app"
            "/Applications/Tabby.app"
        )
    else
        if command -v tabby >/dev/null 2>&1; then
            executable="$(command -v tabby)"
            if command -v readlink >/dev/null 2>&1; then
                executable="$(readlink -f "$executable" 2>/dev/null || printf '%s' "$executable")"
            fi
            executable_dir="$(cd "$(dirname "$executable")" && pwd -P)"
            candidates+=("$executable_dir")
        fi
        candidates+=(
            "/opt/Tabby"
            "/opt/tabby"
            "/usr/lib/tabby"
            "/usr/lib/Tabby"
            "/usr/share/tabby"
        )
    fi

    for candidate in "${candidates[@]}"; do
        if [[ -d "$candidate" ]]; then
            if [[ -d "$candidate/Contents/Resources/builtin-plugins" ||
                  -d "$candidate/resources/builtin-plugins" ||
                  -d "$candidate/Resources/builtin-plugins" ||
                  -d "$candidate/builtin-plugins" ]]; then
                printf '检测到 Tabby 安装路径: %s\n' "$candidate"
                resolve_resources_path "$candidate"
                return
            fi
        fi
    done

    die "未找到 Tabby 安装目录，请通过 --tabby-path 指定路径"
}

if [[ -n "$TABBY_PATH" ]]; then
    [[ -d "$TABBY_PATH" ]] || die "指定的 Tabby 路径不存在: $TABBY_PATH"
    resolve_resources_path "$TABBY_PATH"
else
    detect_tabby_path
fi

if [[ -z "$PACKAGE_PATH" ]]; then
    PACKAGE_PATH="$REPO_ROOT/自带插件.zip"
elif [[ "$PACKAGE_PATH" != /* ]]; then
    PACKAGE_PATH="$REPO_ROOT/$PACKAGE_PATH"
fi

VALID_PLUGINS=()
while IFS= read -r plugin_name; do
    [[ -n "$plugin_name" ]] && VALID_PLUGINS+=("$plugin_name")
done < <(node - "$REPO_ROOT" <<'NODE'
const fs = require('fs')
const path = require('path')
const root = process.argv[2]

for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith('tabby-')) continue
    const packagePath = path.join(root, entry.name, 'package.json')
    if (!fs.existsSync(packagePath)) continue
    try {
        const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'))
        if (pkg.keywords?.includes('tabby-builtin-plugin') && pkg.scripts?.build) {
            console.log(entry.name.slice(6))
        }
    } catch (_) {}
}
NODE
)

((${#VALID_PLUGINS[@]} > 0)) || die "未在仓库中找到可部署的内置插件"

is_valid_plugin() {
    local requested="$1"
    local valid=""
    for valid in "${VALID_PLUGINS[@]}"; do
        [[ "$requested" == "$valid" ]] && return 0
    done
    return 1
}

PLUGIN_LIST=()
if [[ -z "${PLUGIN//[[:space:]]/}" || "${PLUGIN//[[:space:]]/}" == all ]]; then
    PLUGIN_LIST=("${VALID_PLUGINS[@]}")
else
    while IFS= read -r plugin_name; do
        plugin_name="${plugin_name#tabby-}"
        [[ -n "$plugin_name" ]] && PLUGIN_LIST+=("$plugin_name")
    done < <(printf '%s\n' "$PLUGIN" | tr ',[:space:]' '\n\n' | sed '/^$/d')
fi

for plugin_name in "${PLUGIN_LIST[@]}"; do
    is_valid_plugin "$plugin_name" || \
        die "不支持的插件: ${plugin_name}（当前支持: ${VALID_PLUGINS[*]}）"
done

install_package_dependencies() {
    local package_dir="$1"
    local package_name="${package_dir##*/}"

    printf '正在检查 %s 的构建依赖...\n' "$package_name"
    yarn --cwd "$package_dir" install \
        --frozen-lockfile \
        --ignore-scripts \
        --non-interactive \
        --network-timeout 1000000

    # --ignore-scripts 避免为现有 Tabby 部署插件时误编译本地原生模块；
    # package 自带的源码兼容补丁仍需显式应用。
    if [[ -d "$package_dir/patches" ]]; then
        yarn --cwd "$package_dir" patch-package
    fi
}

if [[ "$SKIP_BUILD" == false && "$SKIP_DEPS" == false ]]; then
    command -v yarn >/dev/null 2>&1 || \
        die "未找到 yarn。请先安装 Yarn 1.x，或在确认依赖完整后使用 --skip-deps"

    electron_selected=false
    for plugin_name in "${PLUGIN_LIST[@]}"; do
        [[ "$plugin_name" == electron ]] && electron_selected=true
    done

    # tabby-electron 会从 app/node_modules 解析运行时依赖。
    if [[ "$electron_selected" == true ]]; then
        install_package_dependencies "$REPO_ROOT/app"
    fi
    for plugin_name in "${PLUGIN_LIST[@]}"; do
        install_package_dependencies "$REPO_ROOT/tabby-$plugin_name"
    done
fi

if pgrep -x Tabby >/dev/null 2>&1 || pgrep -x tabby >/dev/null 2>&1; then
    printf '警告: 检测到 Tabby 正在运行，建议先完全退出再部署。\n' >&2
fi

build_plugin() {
    local plugin_name="$1"
    local plugin_root="$REPO_ROOT/tabby-$plugin_name"

    printf '正在构建 tabby-%s...\n' "$plugin_name"
    (cd "$plugin_root" && npm run build)
    [[ -f "$plugin_root/dist/index.js" ]] || \
        die "构建完成但未找到 $plugin_root/dist/index.js"
    printf 'tabby-%s 构建成功。\n' "$plugin_name"
}

for plugin_name in "${PLUGIN_LIST[@]}"; do
    if [[ "$SKIP_BUILD" == false ]]; then
        build_plugin "$plugin_name"
    else
        [[ -f "$REPO_ROOT/tabby-$plugin_name/dist/index.js" ]] || \
            die "未找到 tabby-$plugin_name/dist/index.js，请先构建或去掉 --skip-build"
    fi
done

TARGET_NEEDS_SUDO=false
[[ -w "$RESOURCES_PATH/builtin-plugins" ]] || TARGET_NEEDS_SUDO=true
for plugin_name in "${PLUGIN_LIST[@]}"; do
    destination_root="$RESOURCES_PATH/builtin-plugins/tabby-$plugin_name"
    if [[ -e "$destination_root" && ! -w "$destination_root" ]]; then
        TARGET_NEEDS_SUDO=true
    fi
done

if [[ "$TARGET_NEEDS_SUDO" == true ]]; then
    command -v sudo >/dev/null 2>&1 || die "目标目录不可写且未找到 sudo: $RESOURCES_PATH"
    printf '目标目录需要管理员权限，正在请求 sudo 授权: %s\n' "$RESOURCES_PATH"
    sudo -v
    NEEDS_SUDO=true
fi

run_target_command() {
    if [[ "$NEEDS_SUDO" == true ]]; then
        sudo "$@"
    else
        "$@"
    fi
}

deploy_plugin() {
    local plugin_name="$1"
    local source_root="$REPO_ROOT/tabby-$plugin_name"
    local destination_root="$RESOURCES_PATH/builtin-plugins/tabby-$plugin_name"
    local local_size=""
    local remote_size=""

    printf '正在部署 tabby-%s 到: %s\n' "$plugin_name" "$destination_root"
    run_target_command mkdir -p "$destination_root/dist" "$destination_root/src"
    run_target_command rsync -a --delete "$source_root/dist/" "$destination_root/dist/"
    run_target_command rsync -a --delete "$source_root/src/" "$destination_root/src/"
    run_target_command cp -f "$source_root/package.json" "$destination_root/package.json"

    local_size="$(wc -c < "$source_root/dist/index.js" | tr -d '[:space:]')"
    remote_size="$(run_target_command sh -c 'wc -c < "$1"' sh "$destination_root/dist/index.js" | tr -d '[:space:]')"
    [[ "$local_size" == "$remote_size" ]] || \
        die "部署校验失败: tabby-$plugin_name index.js 大小不一致（本地 ${local_size} / 目标 ${remote_size}）"

    printf 'tabby-%s 部署成功（index.js: %s 字节）。\n' "$plugin_name" "$remote_size"
}

for plugin_name in "${PLUGIN_LIST[@]}"; do
    deploy_plugin "$plugin_name"
done

if [[ "$PLATFORM" == Darwin && -n "$APP_BUNDLE" && "$NO_SIGN" == false ]]; then
    if command -v codesign >/dev/null 2>&1; then
        printf '正在对修改后的应用执行 ad-hoc 签名: %s\n' "$APP_BUNDLE"
        run_target_command codesign --force --deep --sign - "$APP_BUNDLE"
    else
        printf '警告: 未找到 codesign，修改后的应用签名无效，可能无法启动。\n' >&2
    fi
fi

TEMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/tabby-plugins.XXXXXX")"
if [[ "$PLATFORM" == Darwin ]]; then
    ARCHIVE_PREFIX="Contents/Resources"
    EXTRACT_TARGET="Tabby.app 根目录"
else
    ARCHIVE_PREFIX="resources"
    EXTRACT_TARGET="Tabby 安装根目录"
fi

for plugin_name in "${PLUGIN_LIST[@]}"; do
    archive_dir="$TEMP_DIR/$ARCHIVE_PREFIX/builtin-plugins/tabby-$plugin_name/dist"
    mkdir -p "$archive_dir"
    cp "$REPO_ROOT/tabby-$plugin_name/dist/index.js" "$archive_dir/index.js"
done

mkdir -p "$(dirname "$PACKAGE_PATH")"
rm -f -- "$PACKAGE_PATH"
(cd "$TEMP_DIR" && zip -q -9 -r "$PACKAGE_PATH" "${ARCHIVE_PREFIX%%/*}")

package_size="$(wc -c < "$PACKAGE_PATH" | tr -d '[:space:]')"
printf '\n全部部署完成。\n'
printf '构建产物: %s（%s 字节）\n' "$PACKAGE_PATH" "$package_size"
printf 'ZIP 用法: 解压到 %s并覆盖同名文件。\n' "$EXTRACT_TARGET"
printf '请完全退出 Tabby 后重新启动以加载新插件。\n'
