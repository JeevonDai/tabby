/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
import { marker as _ } from '@biesbjerg/ngx-translate-extract-marker'
import { Component, NgZone } from '@angular/core'
import {
    ConfigService,
    Hotkey,
    HotkeyDescription,
    HotkeysService,
    HostAppService,
} from 'tabby-core'

_('Search hotkeys')

/** @hidden */
@Component({
    selector: 'hotkey-settings-tab',
    templateUrl: './hotkeySettingsTab.component.pug',
})
export class HotkeySettingsTabComponent {
    hotkeyFilter = ''
    hotkeyDescriptions: HotkeyDescription[]
    allDuplicateHotkeys = this.getAllDuplicateHotkeys()
    private hotkeysCache = new Map<string, Hotkey[]>()

    constructor (
        public config: ConfigService,
        public hostApp: HostAppService,
        public zone: NgZone,
        hotkeys: HotkeysService,
    ) {
        hotkeys.getHotkeyDescriptions().then(descriptions => {
            this.hotkeyDescriptions = descriptions
        })
    }

    getHotkeys (id: string): Hotkey[] {
        const cached = this.hotkeysCache.get(id)
        if (cached) {
            return cached
        }
        return this.refreshHotkeysCache(id)
    }

    setHotkeys (id: string, hotkeys: Hotkey[]) {
        let ptr = this.config.store
        let prop = 'hotkeys'
        for (const token of id.split(/\./g)) {
            ptr = ptr[prop]
            prop = token
        }
        ptr[prop] = hotkeys.map(hotkey =>
            hotkey.strokes.length === 1 && Array.isArray(hotkey.strokes)
                ? hotkey.strokes[0]
                : hotkey.strokes,
        )
        this.config.save()
        this.allDuplicateHotkeys = this.getAllDuplicateHotkeys()
        this.hotkeysCache.clear()
        this.refreshHotkeysCache(id, hotkeys)
    }

    private refreshHotkeysCache (id: string, hotkeys?: Hotkey[]): Hotkey[] {
        const normalized = hotkeys
            ? hotkeys.map(h => this.detectDuplicates(h.strokes))
            : this.readHotkeysFromConfig(id).map(strokes => this.detectDuplicates(strokes))
        this.hotkeysCache.set(id, normalized)
        return normalized
    }

    private readHotkeysFromConfig (id: string): (string | string[])[] {
        let ptr: unknown = this.config.store.hotkeys
        for (const token of id.split(/\./g)) {
            ptr = (ptr as Record<string, unknown>)?.[token]
        }
        if (typeof ptr === 'string') {
            ptr = [ptr]
        }
        if (!Array.isArray(ptr)) {
            ptr = []
        }
        return ptr as (string | string[])[]
    }

    hotkeyFilterFn (hotkey: HotkeyDescription, query: string): boolean {
        const s = hotkey.name + hotkey.id + this.getHotkeys(hotkey.id).map(h => h.strokes).toString()
        return s.toLowerCase().includes(query.toLowerCase())
    }

    private getAllDuplicateHotkeys (): string[] {
        const allHotkeys = Object
            .values(this.config.store.hotkeys)
            .filter((value: unknown) => Array.isArray(value))
            .flat()
            .map((hotkey: string | string[]) => this.toHotkeyIdentifier(hotkey))

        return allHotkeys.filter(hotkey => allHotkeys.indexOf(hotkey) !== allHotkeys.lastIndexOf(hotkey))
    }

    private detectDuplicates (strokes: string[] | string): Hotkey {
        const hotkeyIdentifier = this.toHotkeyIdentifier(strokes)
        const isDuplicate = this.allDuplicateHotkeys.includes(hotkeyIdentifier)
        return { strokes, isDuplicate }
    }

    private toHotkeyIdentifier (hotkey: string[] | string): string {
        return Array.isArray(hotkey) ? hotkey.join('$#!') : hotkey
    }
}
