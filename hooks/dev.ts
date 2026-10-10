// 开发守卫的纯逻辑：检查命令、危险操作识别、用量格式化。不碰 $，方便测试
import type { Quota, Usage } from '../types'

// ---------- 功能1：改完代码后的检查 ----------

export type CheckConfig = { check?: string; timeoutSec?: number }

// 会改动代码的工具；改过才需要在结束前检查
export const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])

// 项目配置 .claude/muse-buddy.json：{ "check": "pnpm -s typecheck && pnpm -s test", "timeoutSec": 300 }
export function parseConfig(text: string | undefined): CheckConfig {
  if (!text) return {}
  try {
    const c = JSON.parse(text)
    return typeof c?.check === 'string' && c.check.trim() ? { check: c.check, timeoutSec: Number(c.timeoutSec) || 300 } : {}
  } catch {
    return {}
  }
}

// $.process.run 不走 shell，命令串交给系统 shell 解释（&&、管道、pnpm.cmd 都能用）
// mod 环境拿不到平台信息，看会话目录是不是盘符路径
export const isWindowsPath = (cwd: string) => /^[A-Za-z]:[\\/]/.test(cwd)

export const shellArgv = (cmd: string, cwd: string) =>
  isWindowsPath(cwd) ? ['cmd.exe', '/d', '/s', '/c', cmd] : ['sh', '-c', cmd]

// 只取输出结尾，报错一般在最后
export const tail = (text: string, lines = 60) => text.trimEnd().split(/\r?\n/).slice(-lines).join('\n')

export const checkFailed = (cmd: string, exitCode: number, output: string) =>
  `你改过代码，但项目检查没有通过（\`${cmd}\` 退出码 ${exitCode}）。输出结尾：\n\n\`\`\`\n${tail(output)}\n\`\`\`\n\n` +
  '请修复这些问题后再结束；如果失败与本次改动无关，请向用户说明原因，不要假装已完成。'

// ---------- 功能2：危险操作拦截 ----------

const DANGEROUS_COMMANDS: [RegExp, string][] = [
  [/\bgit\s+push\b[^\n]*(\s--force\b|\s-f\b|\s--force-with-lease\b|\s\+\S)/i, 'git 强制推送会覆盖远程历史'],
  [/\bgit\s+reset\s+--hard\b/i, 'git reset --hard 会丢弃未提交的改动'],
  [/\bgit\s+clean\s+-\w*f/i, 'git clean -f 会删除未跟踪的文件'],
  [/\bgit\s+branch\s+-D\b/, 'git branch -D 会强制删除分支'],
  [/\brm\s+(-\w*r\w*f\w*|-\w*f\w*r\w*|-r\s+-f|-f\s+-r|--recursive\s+--force|--force\s+--recursive)\b/i, 'rm -rf 会递归强制删除'],
  [/\bRemove-Item\b(?=[^\n]*-Recurse)(?=[^\n]*-Force)/i, 'Remove-Item -Recurse -Force 会递归强制删除'],
  [/\b(rd|rmdir)\s+\/s\b/i, 'rmdir /s 会递归删除目录'],
  [/\b(drop\s+(table|database|schema)|truncate\s+table)\b/i, '删除或清空数据库对象'],
]

// .env（不含 .env.example / .sample / .template）、私钥、证书私钥
const SECRET_FILE = /(^|[\\/\s"'=])(\.env(\.(?!example\b|sample\b|template\b)[\w.-]+)?|id_(rsa|ed25519|ecdsa)|[\w.-]+\.(pem|key|p12|pfx))(?=$|[\s"';|&)])/i

const FILE_TOOLS: Record<string, string> = {
  Read: 'file_path',
  Edit: 'file_path',
  Write: 'file_path',
  MultiEdit: 'file_path',
  NotebookEdit: 'notebook_path',
}

// 返回拦截原因；安全则返回 undefined
export function danger(tool: string, input: Record<string, unknown>): string | undefined {
  if (tool === 'Bash' || tool === 'PowerShell') {
    const cmd = String(input.command ?? '')
    for (const [re, why] of DANGEROUS_COMMANDS) if (re.test(cmd)) return why
    if (SECRET_FILE.test(cmd)) return '命令涉及密钥或 .env 文件'
  }
  const key = FILE_TOOLS[tool]
  if (key && SECRET_FILE.test(String(input[key] ?? ''))) return '这是密钥或 .env 文件'
  return undefined
}

export const denied = (why: string) =>
  `已被 muse-buddy 安全守卫拦截：${why}。不要换个写法绕过；如果确实需要，请向用户说明理由，让用户自己在终端运行（可在提示框用 ! 前缀）。`

// ---------- 功能3：用量 ----------

const k = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(n))

// 重置的具体时间点（本地时区）：当天 "15:00"，次日 "明天 05:00"，更远 "10/17 05:00"
export function resetAt(resetsAt: string | undefined, now: number) {
  const t = resetsAt ? new Date(resetsAt) : undefined
  if (!t || !(t.getTime() > now)) return ''
  const hm = `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const days = Math.round((day(t) - day(new Date(now))) / 86400000)
  return days === 0 ? hm : days === 1 ? `明天 ${hm}` : `${t.getMonth() + 1}/${t.getDate()} ${hm}`
}

const quota = (name: string, q: Quota | undefined, now: number) => {
  if (!q) return ''
  const at = resetAt(q.resetsAt, now)
  return `${name} ${Math.round(q.percent)}%${at ? `（${at} 重置）` : ''}`
}

// 从 rateLimits 里分出 5 小时窗口和周窗口
export function quotas(limits: { kind: string; percentUsed: number; resetsAt?: string }[]) {
  const pick = (kind: string) => {
    const l = limits.find(x => x.kind === kind)
    return l ? { percent: l.percentUsed, resetsAt: l.resetsAt } : undefined
  }
  return { fiveHour: pick('five_hour'), week: pick('seven_day') }
}

// 额度窗口过了重置时间就作废
const alive = (q: Quota | undefined, now: number) =>
  q && (!q.resetsAt || Date.parse(q.resetsAt) > now) ? q : undefined

// 合并一次新读数：上下文、费用以新读数为准；新读数没带额度时（如 resume 后第一次）沿用旧的有效额度
export function mergeUsage(before: Usage | null | undefined, reading: Usage, now: number): Usage {
  return {
    ...reading,
    fiveHour: reading.fiveHour ?? alive(before?.fiveHour, now),
    week: reading.week ?? alive(before?.week, now),
  }
}

export function usageLine(u: Usage | null, now = 0) {
  if (!u) return ''
  const parts: string[] = []
  if (u.percent !== undefined) parts.push(`上下文 ${Math.round(u.percent)}%${u.tokens ? `（${k(u.tokens)}/${k(u.window)}）` : ''}`)
  if (u.usd !== undefined) parts.push(`$${u.usd.toFixed(2)}`)
  for (const q of [quota('5h额度', u.fiveHour, now), quota('周额度', u.week, now)]) if (q) parts.push(q)
  return parts.join(' · ')
}

// 跨过 80%、90% 各提醒一次
export const crossed = (before: number | undefined, after: number | undefined) =>
  [80, 90].find(t => (before ?? 0) < t && (after ?? 0) >= t)

// 颜色看最紧的那一项
export const usageColor = (u: Usage | null) => {
  const worst = Math.max(u?.percent ?? 0, u?.fiveHour?.percent ?? 0, u?.week?.percent ?? 0)
  return worst >= 90 ? '#ff5f5f' : worst >= 80 ? '#ffaf00' : '#8a8a8a'
}

// ---------- 功能4：长任务完成通知 ----------

// 超过这么久的回复才通知（秒）
export const NOTIFY_AFTER_SEC = 60

export function formatDuration(ms: number) {
  const s = Math.round(ms / 1000)
  const m = Math.floor(s / 60)
  return m ? `${m}分${s % 60}秒` : `${s}秒`
}

// 通知正文：用时 + 回答开头一句
export function notifyText(answer: string, durationMs: number, reason: string) {
  const head = answer.replace(/\s+/g, ' ').trim().slice(0, 80)
  const state = reason === 'answer' ? '完成了' : reason === 'aborted' ? '被中断了' : '出错结束了'
  return { title: `Claude ${state}（用时 ${formatDuration(durationMs)}）`, body: head || '回到终端查看结果' }
}

// 单引号字符串转义：PowerShell 写两个 '，sh 用 '\''
const psq = (s: string) => `'${s.replace(/'/g, "''")}'`
const shq = (s: string) => `'${s.replace(/'/g, `'\''`)}'`

// 系统通知 + 提示音：Windows 托盘气泡，macOS osascript，Linux notify-send
export function notifyArgv(title: string, body: string, isWindows: boolean) {
  if (isWindows) {
    const ps =
      'Add-Type -AssemblyName System.Windows.Forms,System.Drawing;' +
      '$n=New-Object System.Windows.Forms.NotifyIcon;$n.Icon=[System.Drawing.SystemIcons]::Information;$n.Visible=$true;' +
      `$n.ShowBalloonTip(8000,${psq(title)},${psq(body)},'Info');[System.Media.SystemSounds]::Asterisk.Play();` +
      'Start-Sleep -Seconds 8;$n.Dispose()'
    return ['powershell.exe', '-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', ps]
  }
  const osa = `display notification ${JSON.stringify(body)} with title ${JSON.stringify(title)} sound name "Glass"`
  return ['sh', '-c', `command -v osascript >/dev/null && osascript -e ${shq(osa)} || notify-send ${shq(title)} ${shq(body)}`]
}
