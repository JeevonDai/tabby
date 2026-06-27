import { Injectable } from '@angular/core'
import { NewTabParameters, PartialProfile, TranslateService, QuickConnectProfileProvider } from 'tabby-core'
import { TelnetProfileSettingsComponent } from './components/telnetProfileSettings.component'
import { TelnetTabComponent } from './components/telnetTab.component'
import { TelnetProfile } from './session'
import { formatTelnetAddress, parseTelnetAddress } from './address'

@Injectable({ providedIn: 'root' })
export class TelnetProfilesService extends QuickConnectProfileProvider<TelnetProfile> {
    id = 'telnet'
    name = 'Telnet'
    supportsQuickConnect = true
    settingsComponent = TelnetProfileSettingsComponent
    configDefaults = {
        options: {
            host: null,
            port: 23,
            rawMode: false,
            inputMode: 'local-echo',
            outputMode: null,
            inputNewlines: null,
            outputNewlines: 'crlf',
            scripts: [],
            input: { backspace: 'backspace' },
        },
        clearServiceMessagesOnConnect: false,
    }

    constructor (private translate: TranslateService) { super() }

    async getBuiltinProfiles (): Promise<PartialProfile<TelnetProfile>[]> {
        return [
            {
                id: `telnet:template`,
                type: 'telnet',
                name: this.translate.instant('Telnet session'),
                icon: 'fas fa-network-wired',
                options: {
                    host: '',
                    port: 23,
                    inputMode: 'readline',
                    outputMode: null,
                    inputNewlines: null,
                    outputNewlines: 'crlf',
                },
                isBuiltin: true,
                isTemplate: true,
            },
            {
                id: `socket:template`,
                type: 'telnet',
                name: this.translate.instant('Raw socket connection'),
                icon: 'fas fa-network-wired',
                options: {
                    host: '',
                    port: 1234,
                    rawMode: true,
                    inputMode: null,
                    inputNewlines: null,
                    outputMode: null,
                    outputNewlines: null,
                },
                isBuiltin: true,
                isTemplate: true,
            },
        ]
    }

    async getNewTabParameters (profile: TelnetProfile): Promise<NewTabParameters<TelnetTabComponent>> {
        return {
            type: TelnetTabComponent,
            inputs: { profile },
        }
    }

    getSuggestedName (profile: TelnetProfile): string|null {
        return this.getDescription(profile) || null
    }

    getDescription (profile: TelnetProfile): string {
        return profile.options.host ? `${profile.options.host}:${profile.options.port}` : ''
    }

    quickConnect (query: string): PartialProfile<TelnetProfile> {
        const { host, port } = parseTelnetAddress(query)

        return {
            name: query,
            type: 'telnet',
            options: {
                host,
                port,
                inputMode: 'readline',
                outputNewlines: 'crlf',
            },
        }
    }

    intoQuickConnectString (profile: TelnetProfile): string | null {
        return formatTelnetAddress(profile.options.host, profile.options.port)
    }
}
