#!/usr/bin/env node

import fs from 'node:fs/promises'
import path from 'node:path'
import url from 'node:url'

const scriptDir = path.dirname(url.fileURLToPath(import.meta.url))
const tabbyRoot = path.resolve(scriptDir, '..')
const pluginRoot = path.resolve(
    process.env.TABBY_CUSTOM_PLUGINS_ROOT ?? path.join(tabbyRoot, '..'),
)

const plugins = [
    {
        source: 'tabby-command-editor',
        target: 'tabby-command-editor',
        optional: ['python-sdk'],
    },
    {
        source: 'tabby-ssh-button-bar',
        target: 'tabby-ssh-button-bar',
        optional: [],
    },
    {
        source: 'tabby-command-tips',
        target: 'tabby-command-tips',
        optional: [],
    },
]

const builtinRoot = path.join(tabbyRoot, 'builtin-plugins')
await fs.mkdir(builtinRoot, { recursive: true })

for (const plugin of plugins) {
    const source = path.join(pluginRoot, plugin.source)
    const target = path.join(builtinRoot, plugin.target)
    const packagePath = path.join(source, 'package.json')
    const packageJSON = JSON.parse(await fs.readFile(packagePath, 'utf8'))
    const entry = path.join(source, packageJSON.main ?? 'dist/index.js')

    await fs.access(entry)
    await fs.rm(target, { recursive: true, force: true })
    await fs.mkdir(target, { recursive: true })
    await fs.copyFile(packagePath, path.join(target, 'package.json'))
    await fs.cp(path.join(source, 'dist'), path.join(target, 'dist'), { recursive: true })

    for (const name of plugin.optional) {
        const optionalSource = path.join(source, name)
        try {
            await fs.cp(optionalSource, path.join(target, name), { recursive: true })
        } catch (error) {
            if (error.code !== 'ENOENT') {
                throw error
            }
        }
    }

    console.log(`Staged ${packageJSON.name} -> ${target}`)
}
