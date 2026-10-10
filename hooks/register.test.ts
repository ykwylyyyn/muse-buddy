import { test, expect } from 'claude-code/testing'

import { EYE, FACES, HAIR, SHIRT, W, colorOf, dots, runs } from './register'

test('点点循环与台词', () => {
  expect([0, 2, 6, 8].map(dots)).toEqual(['', '.', '...', ''])
  expect(FACES.tool.say('Bash')).toBe('正在用 Bash')
  expect(FACES.error.say('Bash')).toBe('Bash 出错了')
  expect(FACES.error.say('')).toBe('哎呀，出错了')
})

test('每帧 11 行等宽，空闲只闭眼一帧，每种状态至少 8 帧', () => {
  for (const m of Object.values(FACES))
    for (const f of m.frames) {
      expect(f.length).toBe(11)
      for (const row of f) expect(row.length).toBe(W)
    }
  expect(FACES.idle.frames.filter(f => f[3]!.includes("(-) (-)")).length).toBe(1)
  for (const m of Object.values(FACES)) expect(m.frames.length >= 8).toBe(true)
})

test('同色片段合并', () => {
  expect(runs(' **ab', ch => (ch === '*' ? 'y' : 'r'))).toEqual([
    { text: ' ', color: 'r' },
    { text: '**', color: 'y' },
    { text: 'ab', color: 'r' },
  ])
})

test('配色：强调字符、眼睛、衣服渐变随帧流动', () => {
  expect(colorOf('*', 0, 0, 0, 'cyan')).toBe('#ffd700')
  // 眼睛渐变：眼眶和眼珠都取自 EYE，随帧变化
  const eye = [0, 1, 2].map(shift => colorOf('o', 3, 6, shift, 'cyan'))
  for (const c of eye) expect(EYE.includes(c)).toBe(true)
  expect(new Set(eye).size).toBe(3)
  expect(EYE.includes(colorOf('(', 3, 6, 0, 'cyan'))).toBe(true)
  expect(colorOf('|', 3, 3, 0, 'cyan')).toBe('cyan')
  const shirt = [0, 1, 2].map(shift => colorOf('=', 6, 6, shift, 'cyan'))
  for (const c of shirt) expect(SHIRT.includes(c)).toBe(true)
  expect(new Set(shirt).size).toBe(3)
  // 头发渐变：头顶范围内取自 HAIR，范围外的手臂不算
  const hair = [0, 1, 2].map(shift => colorOf('~', 1, 5, shift, 'cyan'))
  for (const c of hair) expect(HAIR.includes(c)).toBe(true)
  expect(new Set(hair).size).toBe(3)
  expect(colorOf('/', 1, 16, 0, 'cyan')).toBe('cyan')
  // 往返取色不越界
  for (let k = 0; k < 40; k++) expect(colorOf('=', 7, k, 0, 'x') !== undefined).toBe(true)
})
