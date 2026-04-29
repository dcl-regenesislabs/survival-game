import { engine, Schemas } from '@dcl/sdk/ecs'

const LeaderboardEntrySchema = Schemas.Map({
  address: Schemas.String,
  displayName: Schemas.String,
  value: Schemas.Number
})

export const GlobalLeaderboardComponent = engine.defineComponent(
  'GlobalLeaderboardComponent',
  {
    kills: Schemas.Array(LeaderboardEntrySchema),
    waves: Schemas.Array(LeaderboardEntrySchema)
  },
  {
    kills: [],
    waves: []
  }
)

export type LeaderboardEntrySnapshot = {
  address: string
  displayName: string
  value: number
}
