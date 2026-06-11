import { marker as _ } from '@biesbjerg/ngx-translate-extract-marker'
import { Component, HostBinding } from '@angular/core'
import { X11Socket } from '../session/x11'
import { AppService, ConfigService, HostAppService, Platform, ProfilesService } from 'tabby-core'
import { SettingsTabComponent } from 'tabby-settings'

_('New SSH connection')

/** @hidden */
@Component({
    templateUrl: './sshSettingsTab.component.pug',
})
export class SSHSettingsTabComponent {
    Platform = Platform
    defaultX11Display: string

    @HostBinding('class.content-box') true

    constructor (
        public config: ConfigService,
        public hostApp: HostAppService,
        private app: AppService,
        private profiles: ProfilesService,
    ) {
        const spec = X11Socket.resolveDisplaySpec()
        if ('path' in spec) {
            this.defaultX11Display = spec.path
        } else {
            this.defaultX11Display = `${spec.host}:${spec.port}`
        }
    }

    newConnection (): void {
        this.profiles.requestNewProfile('ssh')
        this.app.openNewTabRaw({
            type: SettingsTabComponent,
            inputs: { activeTab: 'profiles' },
        })
    }
}
