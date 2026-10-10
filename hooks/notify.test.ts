import { test, expect } from 'claude-code/testing'

import { formatDuration, notifyArgv, notifyText } from './dev'

test('用时与通知文案', () => {
  expect(formatDuration(45_000)).toBe('45秒')
  expect(formatDuration(192_400)).toBe('3分12秒')
  expect(notifyText('  改好了\n\n全部测试通过 ', 125_000, 'answer')).toEqual({ title: 'Claude 完成了（用时 2分5秒）', body: '改好了 全部测试通过' })
  expect(notifyText('', 90_000, 'error').title).toBe('Claude 出错结束了（用时 1分30秒）')
  expect(notifyText('', 90_000, 'aborted').body).toBe('回到终端查看结果')
})

test('通知命令：引号转义，Windows 走 PowerShell', () => {
  const win = notifyArgv("It's done", 'a\'b', true)
  expect(win[0]).toBe('powershell.exe')
  expect(win[win.length - 1]!.includes("'It''s done'")).toBe(true)
  const nix = notifyArgv("It's", 'x', false)
  expect(nix.slice(0, 2)).toEqual(['sh', '-c'])
  expect(nix[2]!.includes(`notify-send 'It'\''s' 'x'`)).toBe(true)
})

test('超过 60 秒的主对话回复才发通知', async ($, on) => {
  const runs: string[][] = []
  on('process.run', (_$, e) => {
    runs.push([...(e as { argv: string[] }).argv])
    return { value: { exitCode: 0, stdout: '', stderr: '' } } as never
  })
  on('ui.toast', () => ({ value: undefined }) as never)
  on('turn.complete', (_$, e) => ({ text: (e as { answer: string }).answer }) as never)

  const turn = (durationMs: number, extra = {}) =>
    $.turn.complete({ answer: '好了', durationMs, isAborted: false, turnId: 't', reason: 'answer', ...extra } as never)

  await turn(30_000)
  expect(runs.length).toBe(0)
  await turn(90_000, { agentId: 'sub' })
  expect(runs.length).toBe(0)
  await turn(90_000)
  expect(runs.length).toBe(1)
})
