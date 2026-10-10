import { test, expect } from 'claude-code/testing'

import { applyTool, openTasks, reminder, window } from './tasks'

const todo = (content: string, status: 'pending' | 'in_progress' | 'completed') => ({ content, status, activeForm: content })

test('TodoWrite 整表替换，TaskList 不会冲掉它', () => {
  const ts = applyTool([], 'TodoWrite', { todos: [todo('A', 'completed'), todo('B', 'pending')] }, {})
  expect(ts.map(t => t.status)).toEqual(['completed', 'pending'])
  expect(applyTool(ts, 'TaskList', {}, { tasks: [] })).toEqual(ts)
  expect(openTasks(ts).map(t => t.subject)).toEqual(['B'])
})

test('TaskCreate / TaskUpdate 增量，deleted 移除，TaskList 实查覆盖', () => {
  let ts = applyTool([], 'TaskCreate', { subject: 'A' }, { task: { id: '1', subject: 'A' } })
  ts = applyTool(ts, 'TaskCreate', { subject: 'B' }, { task: { id: '2', subject: 'B' } })
  ts = applyTool(ts, 'TaskUpdate', { taskId: '1', status: 'completed' }, {})
  expect(openTasks(ts).map(t => t.id)).toEqual(['2'])
  expect(applyTool(ts, 'TaskUpdate', { taskId: '2', status: 'deleted' }, {}).length).toBe(1)
  const real = applyTool(ts, 'TaskList', {}, { tasks: [{ id: '2', subject: 'B', status: 'completed', blockedBy: [] }] })
  expect(openTasks(real).length).toBe(0)
})

test('提醒文本列出每个未完成项', () => {
  const text = reminder([{ id: '1', subject: '写测试', status: 'pending' }])
  expect(text.includes('还有 1 项')).toBe(true)
  expect(text.includes('- [ ] 写测试')).toBe(true)
})

test('长清单窗口停在第一个未完成项附近', () => {
  const ts = Array.from({ length: 20 }, (_, i) => ({
    id: String(i),
    subject: `t${i}`,
    status: (i < 12 ? 'completed' : 'pending') as 'completed' | 'pending',
  }))
  const w = window(ts, 9)
  expect(w.length).toBe(9)
  expect(w[0]!.id).toBe('10')
})

test('Stop 时有未完成项就推回 agent，最多 3 次；全部完成就放行', async ($, on) => {
  on('tool.call', { tool: 'TodoWrite' }, () => ({ result: { oldTodos: [], newTodos: [] } }))
  on('tool.call', { tool: 'TaskList' }, () => ({ result: { tasks: [] } }))
  on('classic.Stop', () => ({}))
  on('prompt.submit', (_$, e) => ({ text: e.text }))
  on('ui.toast', () => ({ value: undefined }) as never)

  await $.tool.call({ tool: 'TodoWrite', todos: [todo('A', 'completed'), todo('B', 'pending')] })
  for (let i = 0; i < 3; i++) {
    const r = await $.classic.Stop({ stop_hook_active: i > 0 })
    expect((r.block ?? '').includes('- [ ] B')).toBe(true)
  }
  expect((await $.classic.Stop({ stop_hook_active: true })).block).toBe(undefined)

  await $.prompt.submit({ text: '继续' } as never)
  await $.tool.call({ tool: 'TodoWrite', todos: [todo('A', 'completed'), todo('B', 'completed')] })
  expect((await $.classic.Stop({ stop_hook_active: false })).block).toBe(undefined)
})
