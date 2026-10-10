import type { Task } from '../types'

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
  '请继续把它们做完，做完一项就立刻把它标成 completed。' +
  '如果某项其实已经完成或不再需要，请如实更新它的状态（completed 或删除），不要带着未完成的项结束。'

// 清单太长时，窗口从第一个未完成项前两行开始
export function window(tasks: Task[], size: number) {
  if (tasks.length <= size) return tasks
  const first = Math.max(0, tasks.findIndex(t => t.status !== 'completed'))
  const start = Math.min(Math.max(0, first - 2), tasks.length - size)
  return tasks.slice(start, start + size)
}
