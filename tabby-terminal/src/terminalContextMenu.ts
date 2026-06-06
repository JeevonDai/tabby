import { Injectable } from '@angular/core'
import { MenuItemOptions, NotificationsService, PlatformService, TranslateService } from 'tabby-core'
import { BaseTerminalTabComponent } from './api/baseTerminalTab.component'
import { TerminalContextMenuItemProvider } from './api/contextMenuProvider'

/** @hidden */
@Injectable()
export class ExportTerminalContextMenu extends TerminalContextMenuItemProvider {
    weight = 0

    constructor (
        private platform: PlatformService,
        private notifications: NotificationsService,
        private translate: TranslateService,
    ) {
        super()
    }

    async getItems (tab: BaseTerminalTabComponent<any>): Promise<MenuItemOptions[]> {
        return [
            {
                label: tab.isSessionLogActive
                    ? this.translate.instant('Stop session log')
                    : this.translate.instant('Start session log'),
                click: async () => {
                    tab.toggleSessionLog()
                },
            },
            {
                label: this.translate.instant('Export to file'),
                click: async () => {
                    const content = tab.getExportContent()
                    if (!content) {
                        return
                    }
                    const data = Buffer.from(content, 'utf8')
                    const download = await this.platform.startDownload('terminal.txt', 0o644, data.length)
                    if (!download) {
                        return
                    }
                    await download.write(data)
                    download.close()
                    this.notifications.info(this.translate.instant('Saved to {path}', { path: download.getName() }))
                },
            },
        ]
    }
}
