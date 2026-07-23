import { Component, HostBinding } from '@angular/core'
import { marker as _ } from '@biesbjerg/ngx-translate-extract-marker'
import { ConfigService, HostAppService, Platform, PlatformService, altKeyName, metaKeyName } from 'tabby-core'

_('Record session logs by default')
_('Start recording automatically when a connection opens')
_('Log file name format')
_('Available values:')
_('Log file extension')

/** @hidden */
@Component({
    templateUrl: './terminalSettingsTab.component.pug',
})
export class TerminalSettingsTabComponent {
    Platform = Platform
    altKeyName = altKeyName
    metaKeyName = metaKeyName

    @HostBinding('class.content-box') true

    constructor (
        public config: ConfigService,
        public hostApp: HostAppService,
        private platform: PlatformService,
    ) { }

    openWSLVolumeMixer (): void {
        this.platform.openPath('sndvol.exe')
        this.platform.exec('wsl.exe', ['tput', 'bel'])
    }
}
