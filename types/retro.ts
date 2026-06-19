export type RetroPhase = 'writing' | 'grouping' | 'voting' | 'results'

export interface Session {
  id: string
  created_at: string
  facilitator_id: string
  title: string
  format: 'wwwdw' | 'ssc' | 'msg'
  is_revealed: boolean
  is_locked: boolean
  phase: RetroPhase
  max_votes?: number
}

export interface Card {
  id: string
  session_id: string
  column_id: string
  author_key: string
  content: string
  created_at: string
  updated_at: string
  position: number
  group_id: string | null
}

export interface CardGroup {
  id: string
  session_id: string
  column_id: string
  name: string
  position: number
  created_at: string
}

export interface Vote {
  id: string
  card_id: string
  user_key: string
  created_at: string
}

export interface Reaction {
  id: string
  card_id: string
  user_key: string
  emoji: string
  created_at: string
}

export interface Participant {
  id: string
  session_id: string
  user_key: string
  display_name: string
  joined_at: string
}

export interface PresenceUser {
  user_key: string
  display_name: string
  online_at: string
}

export interface ColumnDef {
  id: string
  label: string
  color: string
  placeholder: string
}

export interface RetroFormat {
  id: string
  label: string
  columns: ColumnDef[]
}
