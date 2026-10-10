export type Mood = 'idle' | 'thinking' | 'tool' | 'done' | 'error'
export type Buddy = { mood: Mood; frame: number; tool: string }
export type Quota = { percent: number; resetsAt?: string }
export type Usage = { percent?: number; tokens?: number; window: number; usd?: number; fiveHour?: Quota; week?: Quota }
export type Task = { id: string; subject: string; status: 'pending' | 'in_progress' | 'completed' }
// 主对话派出的一个子 agent：id 是那次 Agent 调用的 tool_use_id，agentId 拿到后才有
export type AgentRun = { id: string; agentId?: string; description: string; status: 'in_progress' | 'completed'; failed?: boolean }

declare module 'claude-code' {
  interface PluginState {
    'muse-buddy': { buddy: Buddy; tasks: Task[]; usage: Usage | null; agents: AgentRun[]; subTasks: Record<string, Task[]> }
  }
}
