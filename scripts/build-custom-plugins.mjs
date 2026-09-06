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
const spawnOptions = cwd => ({
    cwd,
    stdio: 'inherit',
    // Windows cannot reliably execute npm.cmd directly through spawnSync.
    shell: process.platform === 'win32',
})
const plugins = [
    'tabby-command-editor',
    'tabby-ssh-button-bar',
    'tabby-command-tips',
]

for (const plugin of plugins) {
    const cwd = path.join(pluginRoot, plugin)

    console.log(`Installing ${plugin} dependencies...`)
    let result = spawnSync(npm, ['ci', '--legacy-peer-deps'], {
        ...spawnOptions(cwd),
    })
    if (result.status !== 0) {
        process.exit(result.status ?? 1)
    }

    console.log(`Building ${plugin}...`)
    result = spawnSync(npm, ['run', 'build'], {
        ...spawnOptions(cwd),
    })
    if (result.status !== 0) {
        process.exit(result.status ?? 1)
    }
}
