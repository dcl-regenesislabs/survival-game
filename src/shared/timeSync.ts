import { engine, RealmInfo, Schemas } from '@dcl/sdk/ecs'
import { isServer, registerMessages } from '@dcl/sdk/network'

const TimeSyncMessages = {
  timeSync: Schemas.Map({
    id: Schemas.String
  }),
  timeSyncResponse: Schemas.Map({
    id: Schemas.String,
    t2: Schemas.Int64,
    t3: Schemas.Int64
  })
}

const timeSyncRoom = registerMessages(TimeSyncMessages)

const SAMPLES_NEEDED = 5
const SAMPLE_INTERVAL = 0.15
const RESYNC_INTERVAL = 60

let initialized = false
let sessionId = ''
let serverTimeOffset = 0
let timeSyncReady = false
let isSyncing = false
let samples: { offset: number; rtt: number }[] = []
let sampleTimer = 0
let resyncTimer = 0
let requestCounter = 0
let pendingRequestId: string | null = null
let pendingT1 = 0

export function initTimeSync(options?: { isServer?: boolean }) {
  if (initialized) return

  const serverMode = options?.isServer ?? isServer()
  if (serverMode) {
    initServer()
  } else {
    initClient()
  }

  initialized = true
}

export function getServerTime(): number {
  return Date.now() + serverTimeOffset
}

export function isTimeSyncReady(): boolean {
  return timeSyncReady
}

function initServer() {
  timeSyncRoom.onMessage('timeSync', (data, context) => {
    if (!context) return
    const t2 = Date.now()
    const t3 = Date.now()
    void timeSyncRoom.send('timeSyncResponse', { id: data.id, t2, t3 }, { to: [context.from] })
  })
  timeSyncReady = true
  serverTimeOffset = 0
}

function initClient() {
  sessionId = Math.random().toString(36).substring(2, 10)
  timeSyncRoom.onMessage('timeSyncResponse', handleResponse)
  engine.addSystem(timeSyncSystem, undefined, 'ntp-time-sync')
}

function isRoomConnected(): boolean {
  const realmInfo = RealmInfo.getOrNull(engine.RootEntity)
  return realmInfo?.isConnectedSceneRoom ?? false
}

function sendRequest() {
  requestCounter += 1
  pendingRequestId = `${sessionId}:${requestCounter}`
  pendingT1 = Date.now()
  void timeSyncRoom.send('timeSync', { id: pendingRequestId })
}

function handleResponse(data: { id: string; t2: number; t3: number }) {
  if (data.id !== pendingRequestId) return

  const t4 = Date.now()
  const t1 = pendingT1
  const { t2, t3 } = data
  pendingRequestId = null

  const rtt = t4 - t1 - (t3 - t2)
  const offset = (t2 - t1 + (t3 - t4)) / 2
  samples.push({ offset, rtt })

  if (samples.length >= SAMPLES_NEEDED) {
    finalizeSamples()
  }
}

function finalizeSamples() {
  samples.sort((a, b) => a.rtt - b.rtt)
  const validSamples = samples.slice(1, -1)
  serverTimeOffset = validSamples.reduce((sum, s) => sum + s.offset, 0) / validSamples.length

  samples = []
  isSyncing = false
  timeSyncReady = true
  resyncTimer = 0
}

function startSync() {
  isSyncing = true
  samples = []
  sampleTimer = SAMPLE_INTERVAL
  pendingRequestId = null
}

function timeSyncSystem(dt: number) {
  if (!isRoomConnected()) return

  if (!timeSyncReady && !isSyncing) {
    startSync()
    return
  }

  if (isSyncing) {
    sampleTimer += dt

    if (pendingRequestId !== null && sampleTimer > 2) {
      pendingRequestId = null
      sampleTimer = 0
    }

    if (pendingRequestId === null && sampleTimer >= SAMPLE_INTERVAL) {
      sampleTimer = 0
      sendRequest()
    }
    return
  }

  resyncTimer += dt
  if (resyncTimer >= RESYNC_INTERVAL) {
    resyncTimer = 0
    startSync()
  }
}
