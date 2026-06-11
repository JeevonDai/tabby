import { marker as _ } from '@biesbjerg/ngx-translate-extract-marker'
import { Component, HostBinding } from '@angular/core'
import { AppService, ProfilesService } from 'tabby-core'
import { SettingsTabComponent } from 'tabby-settings'

_('Serial (COM) connection management is done through the "Profiles & connections" tab')
_('New Serial connection')

/** @hidden */
@Component({
    templateUrl: './serialSettingsTab.component.pug',
})
export class SerialSettingsTabComponent {
    @HostBinding('class.content-box') true

    constructor (
        private app: AppService,
        private profiles: ProfilesService,
    ) { }

    newConnection (): void {
        this.profiles.requestNewProfile('serial')
        this.app.openNewTabRaw({
            type: SettingsTabComponent,
            inputs: { activeTab: 'profiles' },
        })
    }
}
