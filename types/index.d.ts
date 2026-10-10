export type Mood = 'idle' | 'thinking' | 'tool' | 'done' | 'error'
export type Buddy = { mood: Mood; frame: number; tool: string }
export type Task = { id: string; subject: string; status: 'pending' | 'in_progress' | 'completed' }

declare module 'claude-code' {
  interface PluginState {
    'muse-buddy': { buddy: Buddy; tasks: Task[] }
  }
}
