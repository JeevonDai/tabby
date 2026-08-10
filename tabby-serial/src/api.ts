import stripAnsi from 'strip-ansi'
import { SerialPortStream } from '@serialport/stream'
import { createServer, Server, Socket } from 'net'
import { LogService, NotificationsService } from 'tabby-core'
import { Subject, Observable } from 'rxjs'
import { Injector, NgZone } from '@angular/core'
import { BaseSession, ConnectableTerminalProfile, InputProcessingOptions, InputProcessor, LoginScriptsOptions, SessionMiddleware, StreamProcessingOptions, TerminalStreamProcessor, UTF8SplitterMiddleware } from 'tabby-terminal'
import { SerialService } from './services/serial.service'

export interface SerialProfile extends ConnectableTerminalProfile {
    options: SerialProfileOptions
}

export interface SerialProfileOptions extends StreamProcessingOptions, LoginScriptsOptions {
    port: string
    baudrate: number | null
    databits: 5 | 6 | 7 | 8
    stopbits: 1 | 1.5 | 2
    parity: string
    rtscts: boolean
    xon: boolean
    xoff: boolean
    xany: boolean
    slowSend: boolean
    input: InputProcessingOptions,
}

export const BAUD_RATES = [
    110, 150, 300, 1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600, 1500000,
]

export interface SerialPortInfo {
    name: string
    description?: string
}

class SlowFeedMiddleware extends SessionMiddleware {
    feedFromTerminal (data: Buffer): void {
        for (const byte of data) {
            this.outputToSession.next(Buffer.from([byte]))
        }
    }
}

export class SerialSession extends BaseSession {
    serial: SerialPortStream|null

    get serviceMessage$ (): Observable<string> { return this.serviceMessage }
    private serviceMessage = new Subject<string>()
    private streamProcessor: TerminalStreamProcessor
    private zone: NgZone
    private notifications: NotificationsService
    private serialService: SerialService
    private shareServer: Server|null = null
    private shareClients = new Set<Socket>()

    get sharedPort (): number|null {
        const address = this.shareServer?.address()
        return address && typeof address !== 'string' ? address.port : null
    }

    get isSharing (): boolean {
        return this.sharedPort !== null
    }

    constructor (injector: Injector, public profile: SerialProfile) {
        super(injector.get(LogService).create(`serial-${profile.options.port}`))
        this.serialService = injector.get(SerialService)

        this.zone = injector.get(NgZone)
        this.notifications = injector.get(NotificationsService)

        this.streamProcessor = new TerminalStreamProcessor(profile.options)
        this.middleware.push(this.streamProcessor)

        if (this.profile.options.slowSend) {
            this.middleware.unshift(new SlowFeedMiddleware())
        }

        this.middleware.push(new UTF8SplitterMiddleware())
        this.middleware.push(new InputProcessor(profile.options.input))

        this.setLoginScriptsOptions(profile.options)
    }

    async start (): Promise<void> {
        if (!this.profile.options.port) {
            this.profile.options.port = (await this.serialService.listPorts())[0].name
        }

        const serial = this.serial = new SerialPortStream({
            binding: this.serialService.detectBinding(),
            path: this.profile.options.port,
            autoOpen: false,
            baudRate: parseInt(this.profile.options.baudrate as any),
            dataBits: this.profile.options.databits,
            stopBits: this.profile.options.stopbits,
            parity: this.profile.options.parity,
            rtscts: this.profile.options.rtscts,
            xon: this.profile.options.xon,
            xoff: this.profile.options.xoff,
            xany: this.profile.options.xany,
        })
        let connected = false
        await new Promise(async (resolve, reject) => {
            serial.on('open', () => {
                connected = true
                this.zone.run(resolve)
            })
            serial.on('error', error => {
                this.zone.run(() => {
                    if (connected) {
                        this.notifications.error(error.message)
                    } else {
                        reject(error)
                    }
                    this.destroy()
                })
            })
            serial.on('close', () => {
                this.emitServiceMessage('Port closed')
                this.destroy()
            })

            try {
                serial.open()
            } catch (e) {
                this.notifications.error(e.message)
                reject(e)
            }
        })

        this.open = true
        setTimeout(() => this.streamProcessor.start())

        serial.on('readable', () => {
            const data = serial.read() as Buffer|null
            if (!data) {
                return
            }
            for (const client of this.shareClients) {
                if (client.writable) {
                    client.write(data)
                }
            }
            this.emitOutput(data)
        })

        serial.on('end', () => {
            this.logger.info('Shell session ended')
            if (this.open) {
                this.destroy()
            }
        })

        this.loginScriptProcessor?.executeUnconditionalScripts()
    }

    write (data: Buffer): void {
        this.serial?.write(data)
    }

    async destroy (): Promise<void> {
        await this.stopSharing()
        this.serviceMessage.complete()
        await super.destroy()
    }

    async startSharing (preferredPort = 1000): Promise<number> {
        const port = Number(preferredPort)
        if (!Number.isInteger(port) || port < 1 || port > 65535) {
            throw new Error('Serial sharing port must be between 1 and 65535')
        }

        await this.stopSharing()
        for (let candidate = port; candidate <= 65535; candidate++) {
            try {
                this.shareServer = await this.listen(candidate)
                this.emitServiceMessage(`Serial port shared on 0.0.0.0:${candidate}`)
                return candidate
            } catch (error) {
                if (!['EADDRINUSE', 'EACCES'].includes((error as NodeJS.ErrnoException).code ?? '')) {
                    throw new Error(`Could not share serial port on 0.0.0.0:${candidate}: ${(error as Error).message}`)
                }
            }
        }
        throw new Error(`No available TCP port found from ${port} to 65535`)
    }

    async stopSharing (): Promise<void> {
        for (const client of this.shareClients) {
            client.destroy()
        }
        this.shareClients.clear()

        const server = this.shareServer
        this.shareServer = null
        if (server?.listening) {
            await new Promise<void>(resolve => server.close(() => resolve()))
        }
    }

    private listen (port: number): Promise<Server> {
        const server = createServer(client => {
            client.setNoDelay(true)
            this.shareClients.add(client)
            this.emitServiceMessage(`Serial sharing client connected: ${client.remoteAddress}:${client.remotePort}`)

            client.on('data', data => {
                if (this.serial?.writable) {
                    this.serial.write(data)
                }
            })
            client.on('error', error => {
                this.logger.warn('Serial sharing client error', error)
            })
            client.on('close', () => {
                this.shareClients.delete(client)
            })
        })

        return new Promise<Server>((resolve, reject) => {
            const onError = (error: NodeJS.ErrnoException) => {
                server.removeListener('listening', onListening)
                reject(error)
            }
            const onListening = () => {
                server.removeListener('error', onError)
                server.on('error', error => {
                    this.notifications.error(`Serial sharing error: ${error.message}`)
                    this.logger.error('Serial sharing server error', error)
                })
                resolve(server)
            }
            server.once('error', onError)
            server.once('listening', onListening)
            server.listen(port, '0.0.0.0')
        })
    }

    // eslint-disable-next-line @typescript-eslint/no-empty-function, @typescript-eslint/explicit-module-boundary-types, @typescript-eslint/no-empty-function
    resize (_, __) {
        this.streamProcessor.resize()
    }

    kill (_?: string): void {
        this.serial?.close()
    }

    emitServiceMessage (msg: string): void {
        this.serviceMessage.next(msg)
        this.logger.info(stripAnsi(msg))
    }

    async getChildProcesses (): Promise<any[]> {
        return []
    }

    async gracefullyKillProcess (): Promise<void> {
        this.kill('TERM')
    }

    supportsWorkingDirectory (): boolean {
        return false
    }

    async getWorkingDirectory (): Promise<string|null> {
        return null
    }
}
