export type Mood = 'idle' | 'thinking' | 'tool' | 'done' | 'error'
export type Buddy = { mood: Mood; frame: number; tool: string }
export type Quota = { percent: number; resetsAt?: string }
export type Usage = { percent?: number; tokens?: number; window: number; usd?: number; fiveHour?: Quota; week?: Quota }
export type Task = { id: string; subject: string; status: 'pending' | 'in_progress' | 'completed' }

declare module 'claude-code' {
  interface PluginState {
    'muse-buddy': { buddy: Buddy; tasks: Task[]; usage: Usage | null }
  }
}
