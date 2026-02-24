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
  phaseEndTimeMs: Schemas.Number,
  activeDurationSeconds: Schemas.Number,
  restDurationSeconds: Schemas.Number,
  startedByAddress: Schemas.String
}

export const MatchRuntimeStateComponent = engine.defineComponent('MatchRuntimeStateComponent', MatchRuntimeStateSchema, {
  isRunning: false,
  waveNumber: 0,
  cyclePhase: WaveCyclePhase.ACTIVE,
  phaseEndTimeMs: 0,
  activeDurationSeconds: WAVE_ACTIVE_SECONDS,
  restDurationSeconds: WAVE_REST_SECONDS,
  startedByAddress: ''
})

export type MatchRuntimeSnapshot = {
  isRunning: boolean
  waveNumber: number
  cyclePhase: WaveCyclePhase
  phaseEndTimeMs: number
  activeDurationSeconds: number
  restDurationSeconds: number
  startedByAddress: string
}
