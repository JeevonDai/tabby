export interface TelnetAddress {
    host: string
    port: number
}

const DEFAULT_TELNET_PORT = 23

function parsePort (value: string|number): number {
    const port = Number(value)
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error(`Invalid Telnet port: ${value}`)
    }
    return port
}

function validateHost (value: string): void {
    if (!value) {
        throw new Error('Telnet host is empty')
    }
    if (/\s|[/?#\[\]]/.test(value)) {
        throw new Error(`Invalid Telnet host: ${value}`)
    }
    if (!isValidIPv4(value)) {
        throw new Error(`Telnet host must be a valid IPv4 address: ${value}`)
    }
}

function isValidIPv4 (value: string): boolean {
    const parts = value.split('.')
    return parts.length === 4 && parts.every(part => /^\d{1,3}$/.test(part) && Number(part) <= 255)
}

export function parseTelnetAddress (
    hostValue: string|null|undefined,
    portValue: number|null|undefined = DEFAULT_TELNET_PORT,
): TelnetAddress {
    let value = String(hostValue ?? '').trim()
    let port = parsePort(portValue ?? DEFAULT_TELNET_PORT)

    value = value.replace(/^(?:telnet|tcp):(?:\/\/)?/i, '')

    if (value.startsWith('[')) {
        const closingBracket = value.indexOf(']')
        if (closingBracket < 0) {
            throw new Error('Invalid Telnet host: missing closing bracket')
        }
        const suffix = value.slice(closingBracket + 1).trim()
        value = value.slice(1, closingBracket).trim()
        if (suffix) {
            const portMatch = /^:\s*(\d+)$/.exec(suffix)
            if (!portMatch) {
                throw new Error('Invalid Telnet address after IPv6 host')
            }
            port = parsePort(portMatch[1])
        }
    } else {
        const whitespacePort = /^(\S+)\s+(\d+)$/.exec(value)
        if (whitespacePort) {
            const [, parsedHost, parsedPort] = whitespacePort
            value = parsedHost
            port = parsePort(parsedPort)
        } else {
            const slashPort = /^(.+)\/\s*(\d+)$/.exec(value)
            if (slashPort) {
                const [, parsedHost, parsedPort] = slashPort
                value = parsedHost.trim()
                port = parsePort(parsedPort)
            } else if ((value.match(/:/g) ?? []).length === 1) {
                const hostPort = /^(.+):\s*(\d+)$/.exec(value)
                if (hostPort) {
                    const [, parsedHost, parsedPort] = hostPort
                    value = parsedHost.trim()
                    port = parsePort(parsedPort)
                } else {
                    throw new Error(`Invalid Telnet port in address: ${value}`)
                }
            }
        }
    }

    validateHost(value)

    return { host: value, port }
}

export function formatTelnetAddress (host: string, port: number|null|undefined): string {
    const normalizedHost = host.includes(':') ? `[${host}]` : host
    const normalizedPort = port ?? DEFAULT_TELNET_PORT
    return `${normalizedHost}:${normalizedPort}`
}
