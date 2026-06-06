import * as fs from 'fs'
import * as path from 'path'
import type { IDisposable, Terminal } from '@xterm/xterm'

const ANSI_PATTERN = /\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07]*(?:\x07|\x1b\\)|\x1b[()][0-9A-Za-z]|\x1b[@-Z\\-_]|\x1b./g
const INVISIBLE_PATTERN = /[\s\x00-\x1f\x7f\u00a0\u1680\u2000-\u200f\u2028\u2029\u202f\u205f\u3000\ufeff]/g

export function formatTimestamp (date: Date, format: string): string {
    const pad = (value: number, length = 2) => String(value).padStart(length, '0')
    const tokens: Record<string, string> = {
        YYYY: String(date.getFullYear()),
        MM: pad(date.getMonth() + 1),
        DD: pad(date.getDate()),
        HH: pad(date.getHours()),
        mm: pad(date.getMinutes()),
        ss: pad(date.getSeconds()),
        SSS: pad(date.getMilliseconds(), 3),
    }
    return format.replace(/\{YYYY\}|\{MM\}|\{DD\}|\{HH\}|\{mm\}|\{ss\}|\{SSS\}/g, match => tokens[match.slice(1, -1)])
}

export function sanitizeLogFilename (name: string): string {
    return name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim().substring(0, 80) || 'terminal'
}

export function isLoggableLine (text: string): boolean {
    const normalized = text
        .replace(ANSI_PATTERN, '')
        .replace(INVISIBLE_PATTERN, '')
    return normalized.length > 0
}

export function cleanLineForLog (text: string): string {
    return text.replace(ANSI_PATTERN, '')
}

export class TerminalSessionLog {
    private filePath: string | null = null
    private timestampFormat = '[{HH}:{mm}:{ss}] '
    private recording = false
    private lastLoggedAbsoluteY = -1
    private writeParsedDisposable: IDisposable | null = null

    get active (): boolean {
        return this.recording
    }

    get logFilePath (): string | null {
        return this.filePath
    }

    constructor (private xterm: Terminal) { }

    start (filePath: string, timestampFormat: string): void {
        this.stop()
        this.filePath = filePath
        this.timestampFormat = timestampFormat
        this.recording = true
        fs.mkdirSync(path.dirname(filePath), { recursive: true })
        fs.writeFileSync(filePath, '', { encoding: 'utf8', flag: 'w' })
        this.resetBaseline()
        this.writeParsedDisposable = this.xterm.onWriteParsed(() => this.scan())
    }

    stop (): void {
        this.writeParsedDisposable?.dispose()
        this.writeParsedDisposable = null
        this.recording = false
        this.filePath = null
        this.lastLoggedAbsoluteY = -1
    }

    scan (): void {
        if (!this.recording || !this.filePath) {
            return
        }

        const buffer = this.xterm.buffer.active
        if (buffer.type === 'alternate') {
            return
        }

        const cursorAbsY = buffer.baseY + buffer.cursorY

        if (this.lastLoggedAbsoluteY < buffer.baseY - 1) {
            this.lastLoggedAbsoluteY = cursorAbsY - 1
        }

        if (cursorAbsY <= this.lastLoggedAbsoluteY) {
            this.lastLoggedAbsoluteY = cursorAbsY - 1
            return
        }

        for (let y = this.lastLoggedAbsoluteY + 1; y < cursorAbsY; y++) {
            const line = buffer.getLine(y)
            const text = line ? line.translateToString(true) : ''
            if (!isLoggableLine(text)) {
                continue
            }
            this.appendLog(cleanLineForLog(text))
        }

        this.lastLoggedAbsoluteY = cursorAbsY - 1
    }

    private resetBaseline (): void {
        const buffer = this.xterm.buffer.active
        this.lastLoggedAbsoluteY = buffer.baseY + buffer.cursorY - 1
    }

    private appendLog (text: string): void {
        const timestamp = formatTimestamp(new Date(), this.timestampFormat)
        fs.appendFileSync(this.filePath!, `${timestamp}${text}\n`, { encoding: 'utf8' })
    }
}
