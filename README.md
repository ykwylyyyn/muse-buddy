# muse-buddy

Claude Code 终端里的动态小助手：一个 11 行高的 ASCII 小人站在提示框右下角，随 Claude 的状态换动作，头发、眼睛、衣服是流动的渐变色。

| 状态 | 动作 |
|---|---|
| 空闲 | 呼吸摆臂、眨眼 |
| 思考 | 问号飘动、眼珠左右转 |
| 用工具 | 举锤 → 砸下 → 火花 |
| 出错 | 眼泪一路掉到地上 |
| 完成 | 下蹲 → 起跳 → 落地 |

左侧显示 agent 的任务清单（✔ 完成 / ▶ 进行中 / ○ 待做）。mod 自带一个任务工具 `mcp__muse-buddy__tasks`，会话里没有 TodoWrite / TaskCreate 也能用；同时兼容这两种内置工具。agent 每次想结束回复时，会实际查一遍真实状态，有未完成项就把清单发回给它继续处理（每条消息最多提醒 3 次，防止死循环）。

动画只在本地绘制，不消耗 token；只有提醒 agent 时那条提醒会进入对话。渐变需要支持真彩色的终端。

## 开发守卫

### 改完代码自动检查

agent 本轮用 Edit / Write 改过文件后，想结束回复时会先跑项目的检查命令；失败就把输出结尾发回给它修复（每条消息最多 3 次）。通过后才放行。

在项目根目录建 `.claude/muse-buddy.json`：

```json
{ "check": "pnpm -s typecheck && pnpm -s test", "timeoutSec": 300 }
```

命令交给系统 shell 执行（Windows 用 cmd，其他用 sh），`&&`、管道都能用。没有这个文件就不检查。

### 危险操作拦截

以下操作直接拒绝，并告诉 agent 让你自己在终端运行：

- 强制推送、`git reset --hard`、`git clean -f`、`git branch -D`
- 递归强制删除（`rm -rf`、`Remove-Item -Recurse -Force`、`rmdir /s`）
- `DROP TABLE / DATABASE / SCHEMA`、`TRUNCATE TABLE`
- 读写 `.env*`（`.env.example` 等模板除外）、私钥（`id_rsa` 等）、`*.pem` / `*.key` / `*.p12` / `*.pfx`

确实需要时，在提示框用 `!` 前缀自己执行。按命令文本匹配，所以 commit 信息等字符串里出现这些字样也会被拦。

### 用量显示

左栏第一行显示上下文占用、本会话费用，以及订阅的 5 小时额度和周额度（含距重置的时间），例如：

```
上下文 45%（90k/200k） · $0.32 · 5h额度 30%（2时15分后重置） · 周额度 12%（3天5时后重置）
```

上下文、5 小时额度、周额度各自跨过 80%、90% 时弹一次提醒；颜色按最紧的一项变橙（≥80%）或红（≥90%）。非订阅账号没有额度数据，就只显示上下文和费用。

## 安装

在 Claude Code 终端的提示框里输入：

```
/plugin install muse-buddy --marketplace ykwylyyyn/muse-buddy
```

按 `y` 添加市场，再按 Enter 选用户范围即可。

## 更新升级

在系统终端（不是 Claude 的提示框）里运行：

```
claude plugin marketplace update muse-buddy
claude plugin update muse-buddy@muse-buddy
```

第一行拉取仓库最新的清单，第二行装上新版本。装完后重启 Claude Code 生效（已开着的会话也可以输入 `/reload-plugins`）。

用 `claude plugin list` 可以查看当前装的版本号。

## 卸载

```
claude plugin uninstall muse-buddy@muse-buddy
```

## 自定义

造型和配色都在 `hooks/register.tsx` 开头：`FACES`（各状态帧）、`HAIR` / `EYE` / `SHIRT`（渐变色）、`ACCENT`（星星、问号等）。帧速在 `$.clock.every(150, …)`。
