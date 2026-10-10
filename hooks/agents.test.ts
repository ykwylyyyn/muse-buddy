import { test, expect } from 'claude-code/testing'

import { agentLinked, agentReturned, agentStarted, agentStopped, rows } from './tasks'

const todo = (content: string, status: 'pending' | 'in_progress' | 'completed') => ({ content, status, activeForm: content })

test('同步子 agent：派出→运行中，返回即完成', () => {
  let rs = agentStarted([], 'u1', '查接口')
  expect(rs[0]!.status).toBe('in_progress')
  rs = agentLinked(rs, 'ag1')
  expect(rs[0]!.agentId).toBe('ag1')
  rs = agentReturned(rs, 'u1', { status: 'completed', agentId: 'ag1' }, false)
  expect([rs[0]!.status, rs[0]!.agentId]).toEqual(['completed', 'ag1'])
})

test('后台子 agent：返回后仍运行中，SubagentStop 才完成；失败标注', () => {
  let rs = agentStarted([], 'u1', '跑测试')
  rs = agentReturned(rs, 'u1', { status: 'async_launched', agentId: 'ag1' }, false)
  expect(rs[0]!.status).toBe('in_progress')
  rs = agentStopped(rs, 'ag1')
  expect(rs[0]!.status).toBe('completed')
  const failed = agentReturned(agentStarted([], 'u2', 'x'), 'u2', undefined, true)
  expect([failed[0]!.status, failed[0]!.failed]).toEqual(['completed', true])
})

test('并行派出时先挂错的 agentId 会被返回结果纠正', () => {
  let rs = agentStarted(agentStarted([], 'u1', 'A'), 'u2', 'B')
  rs = agentLinked(rs, 'agB') // 实际是 B 的，却先挂到了 A
  rs = agentReturned(rs, 'u2', { status: 'completed', agentId: 'agB' }, false)
  expect(rs.map(r => r.agentId)).toEqual([undefined, 'agB'])
})

test('面板行：主清单在前，子 agent 下缩进挂它自己的清单', () => {
  const r = rows(
    [{ id: '1', subject: '主任务', status: 'pending' }],
    [{ id: 'u1', agentId: 'ag1', description: '查接口', status: 'in_progress' }],
    {
      ag1: [{ id: 't', subject: '读文档', status: 'completed' }],
      orphan: [{ id: 't', subject: '孤儿任务', status: 'pending' }],
    },
  )
  expect(r.map(x => [x.depth, x.subject])).toEqual([
    [0, '主任务'],
    [0, '子 agent：查接口'],
    [1, '读文档'],
    [0, '子 agent orphan'],
    [1, '孤儿任务'],
  ])
  expect(new Set(r.map(x => x.key)).size).toBe(r.length)
})

test('子 agent 记任务不会覆盖主清单；它结束前漏项会被推回', async ($, on) => {
  on('classic.Stop', () => ({}))
  on('classic.SubagentStop', () => ({}))
  on('ui.toast', () => ({ value: undefined }) as never)

  await $.tool.call({ tool: 'mcp__muse-buddy__tasks', todos: [todo('主任务', 'pending')] } as never)
  const sub = await $.tool.call({ tool: 'mcp__muse-buddy__tasks', agentId: 'ag1', todos: [todo('子任务', 'pending')] } as never)
  expect(String((sub as { result?: unknown }).result).includes('子任务')).toBe(true)
  expect(String((sub as { result?: unknown }).result).includes('主任务')).toBe(false)

  const stopSub = { stop_hook_active: false, agent_id: 'ag1', agent_type: 'general-purpose', agent_transcript_path: '' } as never
  expect(((await $.classic.SubagentStop(stopSub)).block ?? '').includes('- [ ] 子任务')).toBe(true)

  await $.tool.call({ tool: 'mcp__muse-buddy__tasks', agentId: 'ag1', todos: [todo('子任务', 'completed')] } as never)
  expect((await $.classic.SubagentStop(stopSub)).block).toBe(undefined)

  // 主清单还在：主对话停下时仍然被提醒
  expect(((await $.classic.Stop({ stop_hook_active: false })).block ?? '').includes('- [ ] 主任务')).toBe(true)
})
