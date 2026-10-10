export type Mood = 'idle' | 'thinking' | 'tool' | 'done' | 'error'
export type Buddy = { mood: Mood; frame: number; tool: string }

declare module 'claude-code' {
  interface PluginState {
    'muse-buddy': { buddy: Buddy }
  }
}
