#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import path from 'node:path'
import url from 'node:url'

const scriptDir = path.dirname(url.fileURLToPath(import.meta.url))
const tabbyRoot = path.resolve(scriptDir, '..')
const pluginRoot = path.resolve(
    process.env.TABBY_CUSTOM_PLUGINS_ROOT ?? path.join(tabbyRoot, '..'),
)
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const plugins = [
    'tabby-command-editor',
    'tabby-ssh-button-bar',
    'tabby-command-tips',
]

for (const plugin of plugins) {
    const cwd = path.join(pluginRoot, plugin)

    console.log(`Installing ${plugin} dependencies...`)
    let result = spawnSync(npm, ['ci', '--legacy-peer-deps'], {
        cwd,
        stdio: 'inherit',
    })
    if (result.status !== 0) {
        process.exit(result.status ?? 1)
    }

    console.log(`Building ${plugin}...`)
    result = spawnSync(npm, ['run', 'build'], {
        cwd,
        stdio: 'inherit',
    })
    if (result.status !== 0) {
        process.exit(result.status ?? 1)
    }
}
