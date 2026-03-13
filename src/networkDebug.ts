type NetworkTraceLine = string

const MAX_NETWORK_TRACE_LINES = 40
const networkTraceLines: NetworkTraceLine[] = []

function stringifyPayload(payload: unknown): string {
  try {
    return JSON.stringify(payload)
  } catch {
    return '[unserializable]'
  }
}

function pushNetworkTrace(line: string): void {
  const timestamp = new Date().toISOString().slice(11, 23)
  networkTraceLines.push(`${timestamp} ${line}`)
  if (networkTraceLines.length > MAX_NETWORK_TRACE_LINES) {
    networkTraceLines.shift()
  }
}

export function logNetworkSend(channel: string, payload: unknown): void {
  pushNetworkTrace(`SEND ${channel} ${stringifyPayload(payload)}`)
}

export function logNetworkReceive(channel: string, payload: unknown): void {
  pushNetworkTrace(`RECV ${channel} ${stringifyPayload(payload)}`)
}

export function getNetworkTraceLines(): readonly NetworkTraceLine[] {
  return networkTraceLines
}
