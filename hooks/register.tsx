import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type { Buddy, Mood, Task, Usage } from '../types'
import { applyTool, openTasks, reminder, summary, window } from './tasks'
import { EDIT_TOOLS, checkFailed, crossed, danger, denied, mergeUsage, parseConfig, quotas, shellArgv, usageColor, usageLine } from './dev'

const buddy = atom({ plugin: 'muse-buddy', key: 'buddy' } as const, { mood: 'idle', frame: 0, tool: '' } as Buddy)
const tasks = atom({ plugin: 'muse-buddy', key: 'tasks' } as const, [] as Task[])
const usage = atom({ plugin: 'muse-buddy', key: 'usage' } as const, null as Usage | null)

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

const TASK_LOOK: Record<Task['status'], { icon: string; color: string }> = {
  completed: { icon: '✔', color: '#5fd787' },
  in_progress: { icon: '▶', color: '#ffd75f' },
  pending: { icon: '○', color: '#bcbcbc' },
}

export const dots =(frame: number) => '.'.repeat((frame >> 1) % 4)

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

const TASKS_TOOL_ID = 'mcp__muse-buddy__tasks'
const TASKS_TOOL = {
  name: 'tasks',
  description:
    '任务清单（显示在用户终端上，结束回复前会被检查）。做任何多步骤任务时：开始先用它写下完整清单，' +
    '每开始一项标 in_progress，做完一项立刻标 completed。每次调用传完整清单（整表替换）。' +
    '结束回复前所有项都必须是 completed；不再需要的项直接从清单里去掉。',
  inputSchema: {
    type: 'object',
    properties: {
      todos: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            content: { type: 'string', description: '任务内容' },
            status: { type: 'string', enum: ['pending', 'in_progress', 'completed'] },
          },
          required: ['content', 'status'],
        },
      },
    },
    required: ['todos'],
  },
  isDeferred: false,
}

// 同一轮最多把 agent 推回去几次，防止它卡住时无限循环
const MAX_NAGS = 3
let nags = 0

// 不信缓存：直接调 TaskList 看真实状态；没有这个工具（只用 TodoWrite 的会话）就沿用记下的表
async function syncTasks($: EngineInterface) {
  try {
    const r = await $.tool.call({ tool: 'TaskList' })
    if (!r.isError && !r.deny) await update($, tasks, ts => applyTool(ts, 'TaskList', {}, r.result))
  } catch {
    // 工具不存在或被中断：用已记录的清单判断
  }
}

type Reading = {
  context: { percent?: number; tokens?: number; window: number }
  rateLimits: { kind: string; percentUsed: number; resetsAt?: string }[]
  cost?: { usd: number }
}

// 记下一次用量读数并返回前后两份；额度另存到跨会话存储，resume / 新会话一开就能显示
async function recordUsage($: EngineInterface, r: Reading) {
  const now = await $.clock.now()
  const before = await read($, usage)
  const stored = before ?? ((await $.store.get('usage')) as Usage | undefined)
  const reading: Usage = {
    percent: r.context.percent,
    tokens: r.context.tokens,
    window: r.context.window,
    usd: r.cost?.usd,
    ...quotas(r.rateLimits),
  }
  const after = mergeUsage(stored, reading, now)
  await update($, usage, () => after)
  if (after.fiveHour || after.week) await $.store.set('usage', { window: after.window, fiveHour: after.fiveHour, week: after.week })
  return { before, after }
}

// 本轮之后改过代码、检查还没通过
let isDirty = false
let checkNags = 0

// 跑项目配置的检查命令；没配置或没改过代码就跳过。返回失败时给 agent 的说明
async function runCheck($: EngineInterface, cwd: string): Promise<string | undefined> {
  if (!isDirty) return undefined
  const path = '.claude/muse-buddy.json'
  const config = parseConfig((await $.fs.exists(path)) ? String(await $.fs.read(path)) : undefined)
  if (!config.check) return undefined
  $.ui.toast(`正在检查：${config.check}`)
  try {
    const r = await $.process.run(shellArgv(config.check, cwd), { cwd, timeoutMs: (config.timeoutSec ?? 300) * 1000 })
    if (r.exitCode === 0) {
      isDirty = false
      $.ui.toast('检查通过 ✔')
      return undefined
    }
    return checkFailed(config.check, r.exitCode, `${r.stdout}
${r.stderr}`)
  } catch (err) {
    return checkFailed(config.check, -1, `检查命令没能跑完（超时或无法启动）：${String(err)}`)
  }
}

export const register: Register = on => {
  // 功能3：用量变化时记下，跨过 80% / 90% 提醒
  on('session.measure', async ($, e, next) => {
    const { before, after: now } = await recordUsage($, e)
    const t = crossed(before?.percent, now.percent)
    if (t) $.ui.toast(`上下文已用 ${t}%：建议先 /compact 压缩或开新会话`)
    const t5 = crossed(before?.fiveHour?.percent, now.fiveHour?.percent)
    if (t5) $.ui.toast(`5 小时额度已用 ${t5}%`)
    const tw = crossed(before?.week?.percent, now.week?.percent)
    if (tw) $.ui.toast(`周额度已用 ${tw}%`)
    return next(e)
  })

  on('session.start', async ($, e, next) => {
    animate($)
    // 很多会话没有 TodoWrite / TaskCreate，自带一个记任务的工具
    await $.tool.register(TASKS_TOOL)
    // resume 时引擎不一定马上推送用量：先主动读一次，读不到额度就用上次存下的
    try {
      await recordUsage($, await $.session.usage())
    } catch {
      // 会话还没绑定好等情况：等下一次 session.measure
    }
    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    await setMood($, 'thinking')
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    nags = 0
    checkNags = 0
    // 上一批全做完了，新一轮清空
    if (openTasks(await read($, tasks)).length === 0) await update($, tasks, () => [])
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    // 功能2：危险命令、密钥文件直接拒绝
    const why = danger(e.tool, e as unknown as Record<string, unknown>)
    if (why) {
      $.ui.toast(`已拦截 ${e.tool}：${why}`)
      return { deny: denied(why) }
    }
    // 自带任务工具：整表替换，回给模型当前清单（名字是运行时注册的，不在内置工具类型里）
    if ((e.tool as string) === TASKS_TOOL_ID) {
      const list = await update($, tasks, ts => applyTool(ts, 'TodoWrite', e, {}))
      return { result: summary(list) }
    }
    // 自己在 Stop 时实查用的 TaskList 不算小人的动作
    const quiet = e.tool === 'TaskList'
    if (!quiet) await setMood($, 'tool', e.tool)
    const result = await next(e)
    if (!result.isError && !result.deny) await update($, tasks, ts => applyTool(ts, e.tool, e, result.result))
    if (!result.isError && !result.deny && EDIT_TOOLS.has(e.tool)) isDirty = true
    if (!quiet) await (result.isError ? setMood($, 'error', e.tool) : setMood($, 'thinking'))
    return result
  }).catch(($, e, next) => {
    // 钩子出错时守卫仍然生效：危险的照样拒，其余放行
    if (next.called) return next(e)
    const why = danger(e.tool, e as unknown as Record<string, unknown>)
    return why ? { deny: denied(why) } : next(e)
  })

  // agent 想停下时实际查一遍清单，有漏的就把它推回去继续做
  on('classic.Stop', async ($, e, next) => {
    const r = await next(e)
    if (r.block) return r
    await syncTasks($)
    const open = openTasks(await read($, tasks))
    if (open.length && nags < MAX_NAGS) {
      nags += 1
      $.ui.toast(`提醒 agent：还有 ${open.length} 项未完成（第 ${nags}/${MAX_NAGS} 次）`)
      return { ...r, block: reminder(open) }
    }
    // 功能1：清单没问题了，再看改过的代码能不能过检查
    if (checkNags >= MAX_NAGS) return r
    const failure = await runCheck($, e.cwd)
    if (!failure) return r
    checkNags += 1
    $.ui.toast(`检查没通过，已推回 agent 修复（第 ${checkNags}/${MAX_NAGS} 次）`)
    return { ...r, block: failure }
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

    const list = await read($, tasks)
    const u = await read($, usage)
    // 只有要算“几时后重置”时才读时钟
    const meter = usageLine(u, u?.fiveHour?.resetsAt || u?.week?.resetsAt ? await $.clock.now() : 0)
    const done = list.length - openTasks(list).length
    const tally = list.length ? `任务 ${done}/${list.length}` : ''

    // 高度不够时退回单行：只显示脸
    if (e.props.maxRows < body.length) {
      return (
        <Box justifyContent="flex-end" width={e.props.bodyColumns}>
          <Text dimColor>
            {meter ? `${meter} · ` : ''}
            {tally ? `${tally} · ` : ''}
            {line}{' '}
          </Text>
          <Text>{paint(body[3] ?? '', 3)}</Text>
        </Box>
      )
    }

    // 左栏：用量 + 表头 + 至多 8 项 + 省略行，正好不高于小人的 11 行
    const shown = window(list, 8)
    const hidden = list.length - shown.length
    const checklist = (
      <Box key="tasks" flexDirection="column" flexShrink={1}>
        {meter ? (
          <Text color={usageColor(u)} wrap="truncate-end">
            {meter}
          </Text>
        ) : (
          ''
        )}
        <Text bold color="#5fd7ff">
          {tally}
          {nags ? `  · 已提醒 agent ${nags} 次` : ''}
        </Text>
        {shown.map(t => (
          <Text
            key={t.id}
            wrap="truncate-end"
            color={TASK_LOOK[t.status].color}
            dimColor={t.status === 'completed'}
            strikethrough={t.status === 'completed'}
          >
            {TASK_LOOK[t.status].icon} {t.subject}
          </Text>
        ))}
        {hidden ? <Text dimColor>… 共 {list.length} 项，另有 {hidden} 项未显示</Text> : ''}
      </Box>
    )

    return (
      <Box
        justifyContent={list.length || meter ? 'space-between' : 'flex-end'}
        alignItems="flex-end"
        width={e.props.bodyColumns}
      >
        {list.length || meter ? checklist : ''}
        <Box key="buddy" alignItems="center" flexShrink={0}>
          <Text color={face.color}>{line} </Text>
          <Box flexDirection="column">
            {body.map((row, i) => (
              <Text key={String(i)}>{paint(row, i)}</Text>
            ))}
          </Box>
        </Box>
      </Box>
    )
  })
}
