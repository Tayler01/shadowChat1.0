import type { ConnectionProfile } from '../../connections/connectionModel'

export type InnerCirclesHubTab = 'people' | 'circles'

export interface InnerCircleSummary {
  id: string
  name: string
  memberCount: number
}

export type InnerCirclePerson = ConnectionProfile
