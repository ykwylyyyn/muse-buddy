import { test, expect } from 'claude-code/testing'

import { crossed, danger, mergeUsage, parseConfig, quotas, shellArgv, tail, resetAt, usageLine, usageColor } from './dev'

const bash = (command: string) => danger('Bash', { command })

test('危险命令被识别', () => {
  for (const cmd of [
    'git push --force origin main',
    'git push -f',
    'git push origin +main',
    'git reset --hard HEAD~1',
    'git clean -fd',
    'git branch -D feature',
    'rm -rf node_modules',
    'rm -fr /tmp/x',
    'rm -r -f dist',
    'psql -c "DROP TABLE users"',
    'truncate table logs',
  ])
    expect([cmd, bash(cmd) !== undefined]).toEqual([cmd, true])
  expect(danger('PowerShell', { command: 'Remove-Item -Recurse -Force .\\dist' }) !== undefined).toBe(true)
  expect(danger('PowerShell', { command: 'rmdir /s /q build' }) !== undefined).toBe(true)
})

test('正常命令放行', () => {
  for (const cmd of [
    'git push origin main',
    'git reset --soft HEAD~1',
    'git status',
    'rm dist/a.js',
    'rm -r build',
    'pnpm test',
    'node -e "console.log(process.env.HOME)"',
    'cp .env.example .env.example.bak',
    'echo forced',
  ])
    expect([cmd, bash(cmd)]).toEqual([cmd, undefined])
  expect(danger('PowerShell', { command: 'Remove-Item .\\a.txt' })).toBe(undefined)
})

test('密钥与 .env 文件', () => {
  expect(danger('Read', { file_path: 'D:\\project\\.env' }) !== undefined).toBe(true)
  expect(danger('Read', { file_path: '/app/.env.production' }) !== undefined).toBe(true)
  expect(danger('Edit', { file_path: '/home/u/.ssh/id_rsa' }) !== undefined).toBe(true)
  expect(danger('Write', { file_path: 'certs/server.key' }) !== undefined).toBe(true)
  expect(bash('cat .env') !== undefined).toBe(true)
  expect(danger('Read', { file_path: '/app/.env.example' })).toBe(undefined)
  expect(danger('Read', { file_path: '/app/src/env.ts' })).toBe(undefined)
  expect(danger('Read', { file_path: '/app/keyboard.ts' })).toBe(undefined)
  expect(danger('Glob', { pattern: '**/.env' })).toBe(undefined)
})

test('检查配置解析与 shell 选择', () => {
  expect(parseConfig('{"check":"pnpm test"}')).toEqual({ check: 'pnpm test', timeoutSec: 300 })
  expect(parseConfig('{"check":"x","timeoutSec":60}').timeoutSec).toBe(60)
  expect(parseConfig('{"check":""}')).toEqual({})
  expect(parseConfig('not json')).toEqual({})
  expect(parseConfig(undefined)).toEqual({})
  expect(shellArgv('a && b', 'D:\\project')[0]).toBe('cmd.exe')
  expect(shellArgv('a && b', '/home/u')).toEqual(['sh', '-c', 'a && b'])
  expect(tail('1\n2\n3', 2)).toBe('2\n3')
})

test('用量显示与阈值提醒', () => {
  expect(usageLine(null)).toBe('')
  // 用本地时间构造，换时区跑也成立
  const local = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m)
  const now = local(10, 9).getTime()
  const q = quotas([
    { kind: 'five_hour', percentUsed: 30, resetsAt: local(10, 11, 15).toISOString() },
    { kind: 'seven_day', percentUsed: 12.4, resetsAt: local(13, 5).toISOString() },
  ])
  expect(usageLine({ percent: 45.4, tokens: 90000, window: 200000, usd: 0.321, ...q }, now)).toBe(
    '上下文 45%（90k/200k） · $0.32 · 5h额度 30%（11:15 重置） · 周额度 12%（10/13 05:00 重置）',
  )
  // 没有订阅额度数据时不显示
  expect(usageLine({ percent: 10, window: 200000, ...quotas([]) }, now)).toBe('上下文 10%')
  expect(resetAt(local(11, 5).toISOString(), now)).toBe('明天 05:00')
  expect(resetAt(local(9, 5).toISOString(), now)).toBe('')
  // resume 后的读数不带额度：沿用旧值；已过重置时间的旧值丢弃
  const fresh = { percent: 5, window: 200000 }
  const kept = mergeUsage({ window: 200000, ...q }, fresh, now)
  expect([kept.percent, kept.fiveHour?.percent, kept.week?.percent]).toEqual([5, 30, 12.4])
  const later = local(10, 12).getTime()
  const expired = mergeUsage({ window: 200000, ...q }, fresh, later)
  expect([expired.fiveHour, expired.week?.percent]).toEqual([undefined, 12.4])
  // 新读数带了额度就用新的
  expect(mergeUsage({ window: 1, ...q }, { window: 1, fiveHour: { percent: 50 } }, now).fiveHour?.percent).toBe(50)
  // 颜色看最紧的一项
  expect(usageColor({ percent: 10, window: 1, week: { percent: 92 } })).toBe('#ff5f5f')
  expect(crossed(70, 82)).toBe(80)
  expect(crossed(85, 91)).toBe(90)
  expect(crossed(81, 85)).toBe(undefined)
  expect(crossed(undefined, 50)).toBe(undefined)
})

test('拦截生效：危险命令不会执行', async ($, on) => {
  let ran = false
  on('tool.call', { tool: 'Bash' }, () => {
    ran = true
    return { result: { stdout: '', stderr: '', interrupted: false } } as never
  })
  on('ui.toast', () => ({ value: undefined }) as never)
  const r = await $.tool.call({ tool: 'Bash', command: 'git push --force' } as never)
  expect(ran).toBe(false)
  expect(String((r as { deny?: string }).deny ?? (r as { text?: string }).text).includes('muse-buddy')).toBe(true)
})

test('改过代码后 Stop：检查失败推回 agent，通过则放行', async ($, on) => {
  let exitCode = 1
  const ran: string[][] = []
  on('tool.call', { tool: 'Edit' }, () => ({ result: {} }) as never)
  on('fs.exists', () => ({ value: true }) as never)
  on('fs.read', () => ({ value: '{"check":"pnpm test"}' }) as never)
  on('process.run', (_$, e) => {
    ran.push([...(e as { argv: string[] }).argv])
    return { value: { exitCode, stdout: 'FAIL src/a.test.ts\nexpected 1 got 2', stderr: '' } } as never
  })
  on('classic.Stop', () => ({}))
  on('ui.toast', () => ({ value: undefined }) as never)

  // 没改过代码：不跑检查
  expect((await $.classic.Stop({ stop_hook_active: false, cwd: '/repo' } as never)).block).toBe(undefined)
  expect(ran.length).toBe(0)

  await $.tool.call({ tool: 'Edit', file_path: '/repo/a.ts', old_string: 'a', new_string: 'b' } as never)
  const blocked = await $.classic.Stop({ stop_hook_active: false, cwd: '/repo' } as never)
  expect((blocked.block ?? '').includes('expected 1 got 2')).toBe(true)
  expect(ran[0]).toEqual(['sh', '-c', 'pnpm test'])

  exitCode = 0
  expect((await $.classic.Stop({ stop_hook_active: true, cwd: '/repo' } as never)).block).toBe(undefined)
  // 通过后不再重复跑
  await $.classic.Stop({ stop_hook_active: false, cwd: '/repo' } as never)
  expect(ran.length).toBe(2)
})
