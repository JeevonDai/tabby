import { marker as _ } from '@biesbjerg/ngx-translate-extract-marker'
import { Component, HostBinding } from '@angular/core'
import { AppService, ProfilesService } from 'tabby-core'
import { SettingsTabComponent } from 'tabby-settings'

_('Telnet connection management is done through the "Profiles & connections" tab')
_('New Telnet connection')
_('New raw socket connection')

/** @hidden */
@Component({
    templateUrl: './telnetSettingsTab.component.pug',
})
export class TelnetSettingsTabComponent {
    @HostBinding('class.content-box') true

    constructor (
        private app: AppService,
        private profiles: ProfilesService,
    ) { }

    newConnection (): void {
        this.profiles.requestNewProfile('telnet')
        this.app.openNewTabRaw({
            type: SettingsTabComponent,
            inputs: { activeTab: 'profiles' },
        })
    }

    newRawSocketConnection (): void {
        this.profiles.requestNewProfile('telnet', 'socket:template')
        this.app.openNewTabRaw({
            type: SettingsTabComponent,
            inputs: { activeTab: 'profiles' },
        })
    }
}
