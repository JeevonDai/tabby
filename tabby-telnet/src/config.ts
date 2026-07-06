import { ConfigProvider } from 'tabby-core'

/** @hidden */
export class TelnetConfigProvider extends ConfigProvider {
    defaults = {
        telnet: {
            warnOnClose: true,
        },
        hotkeys: {
            'restart-telnet-session': [],
        },
    }
}
