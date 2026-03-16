type NetworkTraceLine = string

const MAX_NETWORK_TRACE_LINES = 40
const networkTraceLines: NetworkTraceLine[] = []

type ProfileLoadAttempt = {
  sentAt: string
  isConnectedSceneRoom: boolean
}

const profileLoadAttempts: ProfileLoadAttempt[] = []
let firstRecvAt: string | null = null
let waitingForFirstRecv = false

function now(): string {
  return new Date().toISOString().slice(11, 23)
}

function stringifyPayload(payload: unknown): string {
  try {
    return JSON.stringify(payload)
  } catch {
    return '[unserializable]'
  }
}

function pushNetworkTrace(line: string): void {
  networkTraceLines.push(`${now()} ${line}`)
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

export function logProfileLoadAttempt(isConnectedSceneRoom: boolean): void {
  profileLoadAttempts.push({ sentAt: now(), isConnectedSceneRoom })
  firstRecvAt = null
  waitingForFirstRecv = true
}

export function notifyFirstRecv(): void {
  if (!waitingForFirstRecv || firstRecvAt !== null) return
  firstRecvAt = now()
  waitingForFirstRecv = false
}

export function getProfileLoadDebugState() {
  return {
    attempts: profileLoadAttempts as readonly ProfileLoadAttempt[],
    firstRecvAt
  }
}

export function getNetworkTraceLines(): readonly NetworkTraceLine[] {
  return networkTraceLines
}
