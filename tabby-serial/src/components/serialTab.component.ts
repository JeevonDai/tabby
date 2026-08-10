/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
import { marker as _ } from '@biesbjerg/ngx-translate-extract-marker'
import colors from 'ansi-colors'
import { Component, Injector } from '@angular/core'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap'
import { Platform, PromptModalComponent, SelectorService } from 'tabby-core'
import { BaseTerminalTabComponent, ConnectableTerminalTabComponent } from 'tabby-terminal'
import { SerialSession, BAUD_RATES, SerialProfile } from '../api'

/** @hidden */
@Component({
    selector: 'serial-tab',
    template: `${BaseTerminalTabComponent.template} ${require('./serialTab.component.pug')}`,
    styleUrls: ['./serialTab.component.scss', ...BaseTerminalTabComponent.styles],
    animations: BaseTerminalTabComponent.animations,
})
export class SerialTabComponent extends ConnectableTerminalTabComponent<SerialProfile> {
    session: SerialSession|null = null
    Platform = Platform
    private sharingPort = 1000

    // eslint-disable-next-line @typescript-eslint/no-useless-constructor
    constructor (
        injector: Injector,
        private selector: SelectorService,
        private ngbModal: NgbModal,
    ) {
        super(injector)
        this.enableToolbar = true
    }

    ngOnInit () {
        this.subscribeUntilDestroyed(this.hotkeys.hotkey$, hotkey => {
            if (!this.hasFocus) {
                return
            }
            switch (hotkey) {
                case 'home':
                    this.sendInput('\x1b[H' )
                    break
                case 'end':
                    this.sendInput('\x1b[F' )
                    break
                case 'restart-serial-session':
                    this.reconnect()
                    break
            }
        })

        super.ngOnInit()

        setImmediate(() => {
            this.setTitle(this.profile.name)
        })
    }

    async initializeSession () {
        super.initializeSession()

        const session = new SerialSession(this.injector, this.profile)
        this.setSession(session)

        this.startSpinner(this.translate.instant(_('Connecting')))

        try {
            await this.session!.start()
            this.stopSpinner()
            session.emitServiceMessage(this.translate.instant(_('Port opened')))
        } catch (e) {
            this.stopSpinner()
            this.write(colors.black.bgRed(' X ') + ' ' + colors.red(e.message) + '\r\n')
            return
        }
        this.session!.resize(this.size.columns, this.size.rows)
    }

    protected attachSessionHandlers () {
        this.attachSessionHandler(this.session!.serviceMessage$, msg => {
            this.write(`\r\n${colors.black.bgWhite(' Serial ')} ${msg}\r\n`)
            this.session?.resize(this.size.columns, this.size.rows)
        })
        super.attachSessionHandlers()
    }

    protected onSessionDestroyed (): void {
        if (this.frontend) {
            // Session was closed abruptly
            this.write('\r\n' + colors.black.bgWhite(' SERIAL ') + ` session closed\r\n`)

            super.onSessionDestroyed()
        }
    }

    async changeBaudRate () {
        const rate = await this.selector.show(
            this.translate.instant(_('Baud rate')),
            BAUD_RATES.map(x => ({
                name: x.toString(), result: x, weight: x,
            })),
        )
        this.session?.serial?.update({ baudRate: rate })
        this.profile.options.baudrate = rate
    }

    async toggleSharing () {
        if (!this.session) {
            return
        }
        if (this.session.isSharing) {
            await this.session.stopSharing()
            return
        }
        await this.configureSharingPort()
    }

    async configureSharingPort () {
        if (!this.session) {
            return
        }
        const modal = this.ngbModal.open(PromptModalComponent)
        modal.componentInstance.prompt = this.translate.instant(_('Serial sharing port'))
        modal.componentInstance.value = String(this.session.sharedPort ?? this.sharingPort)
        const result = await modal.result.catch(() => null)
        if (!result) {
            return
        }

        const requestedPort = Number(result.value)
        try {
            const actualPort = await this.session.startSharing(requestedPort)
            this.sharingPort = actualPort
            this.notifications.info(this.translate.instant(
                actualPort === requestedPort
                    ? _('Serial sharing started on port {port}')
                    : _('Port {requestedPort} is occupied. Serial sharing started on port {port}'),
                { requestedPort, port: actualPort },
            ))
        } catch (error) {
            this.notifications.error(error instanceof Error ? error.message : String(error))
        }
    }

    protected isSessionExplicitlyTerminated (): boolean {
        return super.isSessionExplicitlyTerminated() ||
        this.recentInputs.endsWith('close\r') ||
        this.recentInputs.endsWith('quit\r')
    }
}
