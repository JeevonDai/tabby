import { Injectable } from '@angular/core'
import { SettingsTabProvider } from 'tabby-settings'

import { TelnetSettingsTabComponent } from './components/telnetSettingsTab.component'

/** @hidden */
@Injectable()
export class TelnetSettingsTabProvider extends SettingsTabProvider {
    id = 'telnet'
    icon = 'network-wired'
    title = 'Telnet'

    getComponentType (): any {
        return TelnetSettingsTabComponent
    }
}
