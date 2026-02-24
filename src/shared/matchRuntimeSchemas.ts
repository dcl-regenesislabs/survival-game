import { engine, Schemas } from '@dcl/sdk/ecs'
import { WAVE_ACTIVE_SECONDS, WAVE_REST_SECONDS } from './matchConfig'

export enum WaveCyclePhase {
  ACTIVE = 'active',
  REST = 'rest'
}

const MatchRuntimeStateSchema = {
  isRunning: Schemas.Boolean,
  waveNumber: Schemas.Number,
  cyclePhase: Schemas.EnumString<WaveCyclePhase>(WaveCyclePhase, WaveCyclePhase.ACTIVE),
  serverNowMs: Schemas.Int64,
  phaseEndTimeMs: Schemas.Int64,
  activeDurationSeconds: Schemas.Number,
  restDurationSeconds: Schemas.Number,
  startedByAddress: Schemas.String,
  zombiesAlive: Schemas.Number,
  zombiesPlanned: Schemas.Number
}

export const MatchRuntimeStateComponent = engine.defineComponent('MatchRuntimeStateComponent', MatchRuntimeStateSchema, {
  isRunning: false,
  waveNumber: 0,
  cyclePhase: WaveCyclePhase.ACTIVE,
  serverNowMs: 0,
  phaseEndTimeMs: 0,
  activeDurationSeconds: WAVE_ACTIVE_SECONDS,
  restDurationSeconds: WAVE_REST_SECONDS,
  startedByAddress: '',
  zombiesAlive: 0,
  zombiesPlanned: 0
})

export type MatchRuntimeSnapshot = {
  isRunning: boolean
  waveNumber: number
  cyclePhase: WaveCyclePhase
  serverNowMs: number
  phaseEndTimeMs: number
  activeDurationSeconds: number
  restDurationSeconds: number
  startedByAddress: string
  zombiesAlive: number
  zombiesPlanned: number
}
