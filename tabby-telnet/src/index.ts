import { NgModule } from '@angular/core'
import { CommonModule } from '@angular/common'
import { FormsModule } from '@angular/forms'
import { NgbModule } from '@ng-bootstrap/ng-bootstrap'
import { ToastrModule } from 'ngx-toastr'
import { NgxFilesizeModule } from 'ngx-filesize'
import TabbyCoreModule, { ConfigProvider, TabRecoveryProvider, HotkeyProvider, ProfileProvider } from 'tabby-core'
import { SettingsTabProvider } from 'tabby-settings'
import TabbyTerminalModule from 'tabby-terminal'

import { TelnetProfileSettingsComponent } from './components/telnetProfileSettings.component'
import { TelnetSettingsTabComponent } from './components/telnetSettingsTab.component'
import { TelnetTabComponent } from './components/telnetTab.component'

import { TelnetConfigProvider } from './config'
import { TelnetSettingsTabProvider } from './settings'
import { RecoveryProvider } from './recoveryProvider'
import { TelnetHotkeyProvider } from './hotkeys'
import { TelnetProfilesService } from './profiles'

/** @hidden */
@NgModule({
    imports: [
        NgbModule,
        NgxFilesizeModule,
        CommonModule,
        FormsModule,
        ToastrModule,
        TabbyCoreModule,
        TabbyTerminalModule,
    ],
    providers: [
        { provide: ConfigProvider, useClass: TelnetConfigProvider, multi: true },
        { provide: SettingsTabProvider, useClass: TelnetSettingsTabProvider, multi: true },
        { provide: TabRecoveryProvider, useClass: RecoveryProvider, multi: true },
        { provide: HotkeyProvider, useClass: TelnetHotkeyProvider, multi: true },
        { provide: ProfileProvider, useExisting: TelnetProfilesService, multi: true },
    ],
    declarations: [
        TelnetProfileSettingsComponent,
        TelnetSettingsTabComponent,
        TelnetTabComponent,
    ],
})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export default class TelnetModule { }
