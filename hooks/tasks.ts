import type { AgentRun, Task } from '../types'

// 同一会话里 agent 用 TodoWrite（整张表）或 TaskCreate/TaskUpdate（增量）记任务；TaskList 是实查的全量
// ponytail: 输入/结果按工具名手动取字段，工具改了字段名要跟着改
export function applyTool(tasks: Task[], tool: string, input: any, result: any): Task[] {
  switch (tool) {
    case 'TodoWrite':
      return (input.todos ?? []).map((t: any, i: number) => ({ id: `todo-${i}`, subject: t.content, status: t.status }))
    case 'TaskCreate':
      return result?.task ? [...tasks, { id: result.task.id, subject: result.task.subject, status: 'pending' }] : tasks
    case 'TaskUpdate':
      if (input.status === 'deleted') return tasks.filter(t => t.id !== input.taskId)
      return tasks.map(t =>
        t.id === input.taskId ? { ...t, subject: input.subject ?? t.subject, status: input.status ?? t.status } : t,
      )
    case 'TaskList':
      // TodoWrite 的表不在 TaskList 里，别被空结果冲掉
      if (!result?.tasks || tasks.some(t => t.id.startsWith('todo-'))) return tasks
      return result.tasks.map((t: any) => ({ id: t.id, subject: t.subject, status: t.status }))
  }
  return tasks
}

export const openTasks = (tasks: Task[]) => tasks.filter(t => t.status !== 'completed')

export const reminder = (open: Task[]) =>
  `任务清单还有 ${open.length} 项没完成：\n${open.map(t => `- [ ] ${t.subject}`).join('\n')}\n\n` +
  '请继续把它们做完，做完一项就立刻用任务工具（mcp__muse-buddy__tasks，或你在用的 TodoWrite / TaskUpdate）把它标成 completed。' +
  '如果某项其实已经完成或不再需要，请如实更新它的状态（completed 或从清单删除），不要带着未完成的项结束。'

// 工具回给模型的清单
export const summary = (tasks: Task[]) => {
  const open = openTasks(tasks).length
  const mark = { completed: 'x', in_progress: '~', pending: ' ' } as const
  return (
    tasks.map(t => `- [${mark[t.status]}] ${t.subject}`).join('\n') +
    `\n\n共 ${tasks.length} 项，未完成 ${open} 项。` +
    (open ? '结束回复前要全部完成。' : '全部完成。')
  )
}

// 清单太长时，窗口从第一个未完成项前两行开始
export function window<T extends { status: Task['status'] }>(tasks: T[], size: number) {
  if (tasks.length <= size) return tasks
  const first = Math.max(0, tasks.findIndex(t => t.status !== 'completed'))
  const start = Math.min(Math.max(0, first - 2), tasks.length - size)
  return tasks.slice(start, start + size)
}

// ---------- 子 agent ----------

export const agentStarted = (runs: AgentRun[], id: string, description: string): AgentRun[] => [
  ...runs,
  { id, description, status: 'in_progress' },
]

// SubagentStart 只给 agent_id：先挂到最早一个还没认领的运行中条目上，Agent 返回时再按结果校正
// ponytail: 并行派出多个同步子 agent 时可能先挂错，返回结果后自动纠正
export function agentLinked(runs: AgentRun[], agentId: string): AgentRun[] {
  if (runs.some(r => r.agentId === agentId)) return runs
  const i = runs.findIndex(r => r.status === 'in_progress' && !r.agentId)
  return i < 0 ? runs : runs.map((r, j) => (j === i ? { ...r, agentId } : r))
}

// Agent 调用返回：同步的已经跑完；async_launched 是后台跑，等 SubagentStop 再打勾
export function agentReturned(runs: AgentRun[], id: string, result: any, isError: boolean): AgentRun[] {
  const agentId: string | undefined = result?.agentId
  return runs.map(r => {
    if (r.id !== id) return agentId && r.agentId === agentId ? { ...r, agentId: undefined } : r
    if (isError) return { ...r, status: 'completed', failed: true }
    return { ...r, agentId: agentId ?? r.agentId, status: result?.status === 'async_launched' ? 'in_progress' : 'completed' }
  })
}

export const agentStopped = (runs: AgentRun[], agentId: string): AgentRun[] =>
  runs.map(r => (r.agentId === agentId ? { ...r, status: 'completed' } : r))

export type Row = Task & { key: string; depth: 0 | 1; isAgent?: boolean }

// 面板的行：主清单，然后每个子 agent 一行、它自己的清单缩进挂在下面
export function rows(tasks: Task[], runs: AgentRun[], subTasks: Record<string, Task[]>): Row[] {
  const out: Row[] = tasks.map(t => ({ ...t, key: `m-${t.id}`, depth: 0 }))
  const shown = new Set<string>()
  const children = (agentId: string | undefined) => {
    if (!agentId) return
    shown.add(agentId)
    for (const t of subTasks[agentId] ?? []) out.push({ ...t, key: `${agentId}-${t.id}`, depth: 1 })
  }
  for (const r of runs) {
    out.push({
      id: r.id,
      key: `a-${r.id}`,
      subject: `子 agent：${r.description}${r.failed ? '（失败）' : ''}`,
      status: r.status,
      depth: 0,
      isAgent: true,
    })
    children(r.agentId)
  }
  // 认不出是哪次派出的子 agent（比如子 agent 再派子 agent），单独成组
  for (const agentId of Object.keys(subTasks)) {
    if (shown.has(agentId) || !subTasks[agentId]!.length) continue
    out.push({ id: agentId, key: `a-${agentId}`, subject: `子 agent ${agentId.slice(0, 8)}`, status: openTasks(subTasks[agentId]!).length ? 'in_progress' : 'completed', depth: 0, isAgent: true })
    children(agentId)
  }
  return out
}
