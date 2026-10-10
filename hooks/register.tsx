import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type { Buddy, Mood } from '../types'

const buddy = atom({ plugin: 'muse-buddy', key: 'buddy' } as const, { mood: 'idle', frame: 0, tool: '' } as Buddy)

// 全身帧：11 行 × 24 列，纯 ASCII 保证对齐；String.raw 免转义
export const W = 24
const r = String.raw
const f = (art: string) => art.split('\n').slice(1, -1).map(row => row.padEnd(W))

// 配色：头随心情变色；头发、眼睛、衣服流动渐变；牛仔裤 + 棕色鞋；粉嘴巴
const ACCENT: Record<string, string> = { '*': '#ffd700', '?': '#ffd700', '#': '#ffaf00', "'": '#5fd7ff', '+': '#ff5fd7', '.': '#5fd7ff' }
export const HAIR = ['#ff8700', '#ff5f5f', '#ff5f87', '#ff5faf', '#d75fd7', '#af5fff', '#875fff']
export const EYE = ['#00d7ff', '#00ffd7', '#5fff87', '#d7ff5f', '#ffd75f']
export const SHIRT = ['#ff6ec7', '#f06bd3', '#d86ee2', '#b874f0', '#957ffb', '#7390ff', '#55a6ff', '#45bdff', '#44d4f5']
const JEANS = '#5f87d7'
const SHOES = '#af5f00'
const MOUTH = '#ff5f87'

// 三角波往返取色，渐变首尾相接不跳色
const tri = (k: number, n: number) => {
  const m = k % (2 * n - 2)
  return m < n ? m : 2 * n - 2 - m
}

// 某一格的颜色：row 行号、col 列号、shift 让渐变随帧流动
export function colorOf(ch: string, row: number, col: number, shift: number, mood: string) {
  const inFace = col > 3 && col < 15
  // 头发：第 0-1 行头顶范围内，橙→粉→紫流动渐变
  if (row <= 1 && col >= 4 && col <= 14 && ch !== ' ' && ch !== '*' && ch !== '?')
    return HAIR[tri(col - row + shift, HAIR.length)]!
  if (ACCENT[ch]) return ACCENT[ch]!
  // 眼睛连眼眶：青→绿→金流动渐变
  if (row === 3 && inFace && ch !== ' ') return EYE[tri(col + shift, EYE.length)]!
  if (row === 4 && inFace && ch !== ' ') return MOUTH
  if (row >= 6 && row <= 8 && (ch === '=' || ch === '|')) return SHIRT[tri(col + row + shift, SHIRT.length)]!
  if (row === 9) return JEANS
  if (row === 10) return ch === '_' ? SHOES : JEANS
  return mood
}

// 每个关键帧停留 n 拍，节奏更自然
const hold = (n: number, ...frames: string[][]) => frames.flatMap(fr => Array<string[]>(n).fill(fr))
// 换某几行，其余沿用
const swap = (base: string[], rows: Record<number, string>) => base.map((row, i) => (rows[i] ?? row).padEnd(W))
// 两颊（第 2、16 列）挂一滴眼泪
const tear = (base: string[], at: number, ch = "'") =>
  base.map((row, i) => (i === at ? row.slice(0, 2) + ch + row.slice(3, 16) + ch + row.slice(17) : row))

const IDLE = f(r`
     _________
    /~~+~+~+~~\
   |           |
   |  (o) (o)  |
   |   \___/   |
    \_________/
   __|=======|__
  /  |=======|  \
 /   |=======|   \
     |==| |==|
    _|  | |  |_
`)
const SWAY = swap(IDLE, { 7: r`   / |=======| \ `, 8: r`  /  |=======|  \ ` })
const HALF = swap(IDLE, { 3: '   |  (=) (=)  |' })
const BLINK = swap(IDLE, { 3: '   |  (-) (-)  |' })

const THINK = swap(IDLE, { 0: '     _________  ?', 3: '   |  (o) (O)  |', 4: '   |     ~     |' })

const HAMMER_UP = f(r`
     _________     [##]
    /~~+~+~+~~\     ||
   |           |    ||
   |  (>) (<)  |    ||
   |   =====   |   //
    \_________/   //
   __|=======|___//
  /  |=======|
 /   |=======|
     |==| |==|
    _|  | |  |_
`)
const HAMMER_MID = f(r`
     _________
    /~~+~+~+~~\
   |           |   [##]
   |  (>) (<)  |   //
   |   =====   |  //
    \_________/  //
   __|=======|__//
  /  |=======|
 /   |=======|
     |==| |==|
    _|  | |  |_
`)
const HAMMER_HIT = f(r`
     _________
    /~~+~+~+~~\
   |           |
   |  (>) (<)  |
   |   =====   |
    \_________/
   __|=======|__
  /  |=======|  \
 /   |=======|   \_[##]
     |==| |==|       *
    _|  | |  |_     * *
`)
const HAMMER_BOOM = swap(HAMMER_HIT, { 9: '     |==| |==|     *   *', 10: '    _|  | |  |_  *   *' })

const CRY = f(r`
     _________
    /~~+~+~+~~\
   |           |
   |  (T) (T)  |
   |    ~~~    |
    \_________/
     |=======|
    /|=======|\
   / |=======| \
     |==| |==|
    _/  / \  \_
`)
const SOB = swap(CRY, { 3: '   |  (;) (;)  |' })

const HAPPY = { 3: '   |  (^) (^)  |', 4: r`   |   \___/   |` }
const CROUCH = swap(IDLE, { ...HAPPY, 9: r`    /==/   \==\ `, 10: r`   _|_/     \_|_` })
const RISE = swap(IDLE, {
  ...HAPPY,
  0: r` \   _________   /`,
  1: r`  \ /~~+~+~+~~\ /`,
  6: '     |=======|',
  7: '     |=======|',
  8: '     |=======|',
})
const APEX = swap(RISE, { 0: r`*\   _________   /*`, 3: ' * |  (^) (^)  | *' })

export const FACES: Record<Mood, { frames: string[][]; color: string; say: (tool: string) => string }> = {
  // 呼吸摆臂 + 半闭→闭→半闭眨眼，一圈约 3 秒
  idle: { frames: [...hold(6, IDLE, SWAY, IDLE), HALF, BLINK, HALF], color: 'cyan', say: () => '随时待命～' },
  // 问号飘动、眼珠左右转
  thinking: {
    frames: hold(
      2,
      THINK,
      swap(THINK, { 0: '     _________   ?' }),
      swap(THINK, { 0: '     _________    ?', 3: '   |  (O) (o)  |' }),
      swap(THINK, { 0: '     _________   ?', 3: '   |  (O) (o)  |' }),
    ),
    color: 'magenta',
    say: () => '思考中',
  },
  // 举锤→挥下→砸中→火花
  tool: {
    frames: [...hold(2, HAMMER_UP), HAMMER_MID, ...hold(2, HAMMER_HIT, HAMMER_BOOM), HAMMER_MID],
    color: 'yellow',
    say: t => `正在用 ${t}`,
  },
  // 眼泪从脸颊一路掉到地上
  error: {
    frames: hold(2, CRY, tear(SOB, 4), tear(SOB, 6), tear(SOB, 8), tear(SOB, 10, '.')),
    color: 'red',
    say: t => (t ? `${t} 出错了` : '哎呀，出错了'),
  },
  // 下蹲→起跳→最高点→落地
  done: {
    frames: hold(2, CROUCH, RISE, APEX, RISE),
    color: 'green',
    say: () => '搞定啦！',
  },
}

// 一行拆成同色片段
export function runs(row: string, colorAt: (ch: string, col: number) => string) {
  const out: { text: string; color: string }[] = []
  Array.from(row).forEach((ch, col) => {
    const color = colorAt(ch, col)
    const last = out[out.length - 1]
    if (last && last.color === color) last.text += ch
    else out.push({ text: ch, color })
  })
  return out
}

export const dots = (frame: number) => '.'.repeat((frame >> 1) % 4)

let tick: Timer | undefined
let rest: Timer | undefined

function setMood($: EngineInterface, mood: Mood, tool = '') {
  rest?.cancel()
  return update($, buddy, b => ({ ...b, mood, tool }))
}

// 常驻帧时钟：空闲眨眼也靠它，所以一直刷新
function animate($: EngineInterface) {
  tick?.cancel()
  tick = $.clock.every(150, () => update($, buddy, b => ({ ...b, frame: b.frame + 1 })))
}

function rest4s($: EngineInterface) {
  rest = $.clock.after(4000, () => setMood($, 'idle'))
}

export const register: Register = on => {
  on('session.start', ($, e, next) => {
    animate($)
    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    await setMood($, 'thinking')
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    await setMood($, 'tool', e.tool)
    const result = await next(e)
    await (result.isError ? setMood($, 'error', e.tool) : setMood($, 'thinking'))
    return result
  })

  on('turn.complete', async ($, e, next) => {
    await (e.reason === 'answer' ? setMood($, 'done') : setMood($, 'error'))
    rest4s($)
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const b = await read($, buddy)
    const face = FACES[b.mood]
    const body = face.frames[b.frame % face.frames.length] ?? []
    const busy = b.mood === 'thinking' || b.mood === 'tool'
    const line = face.say(b.tool) + (busy ? dots(b.frame) : '')
    const { Box, Text } = $.ui.resolve(e)

    const paint = (row: string, y: number) =>
      runs(row, (ch, x) => colorOf(ch, y, x, b.frame >> 1, face.color)).map((r, i) => (
        <Text key={String(i)} color={r.color} bold={r.color === face.color || EYE.includes(r.color)}>
          {r.text}
        </Text>
      ))

    // 高度不够时退回单行：只显示脸
    if (e.props.maxRows < body.length) {
      return (
        <Box justifyContent="flex-end" width={e.props.bodyColumns}>
          <Text dimColor>{line} </Text>
          <Text>{paint(body[3] ?? '', 3)}</Text>
        </Box>
      )
    }

    return (
      <Box justifyContent="flex-end" alignItems="center" width={e.props.bodyColumns}>
        <Text color={face.color}>{line} </Text>
        <Box flexDirection="column">
          {body.map((row, i) => (
            <Text key={String(i)}>{paint(row, i)}</Text>
          ))}
        </Box>
      </Box>
    )
  })
}
