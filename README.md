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
