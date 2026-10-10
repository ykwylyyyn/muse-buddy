# muse-buddy

Claude Code 终端里的动态小助手：一个 11 行高的 ASCII 小人站在提示框右下角，随 Claude 的状态换动作，头发、眼睛、衣服是流动的渐变色。

| 状态 | 动作 |
|---|---|
| 空闲 | 呼吸摆臂、眨眼 |
| 思考 | 问号飘动、眼珠左右转 |
| 用工具 | 举锤 → 砸下 → 火花 |
| 出错 | 眼泪一路掉到地上 |
| 完成 | 下蹲 → 起跳 → 落地 |

左侧显示 agent 的任务清单（✔ 完成 / ▶ 进行中 / ○ 待做）。agent 每次想结束回复时，会实际调 TaskList 查一遍真实状态，有未完成项就把清单发回给它继续处理（每条消息最多提醒 3 次，防止死循环）。

动画只在本地绘制，不消耗 token；只有提醒 agent 时那条提醒会进入对话。渐变需要支持真彩色的终端。

## 安装

在 Claude Code 终端的提示框里输入：

```
/plugin install muse-buddy --marketplace ykwylyyyn/muse-buddy
```

按 `y` 添加市场，再按 Enter 选用户范围即可。

## 自定义

造型和配色都在 `hooks/register.tsx` 开头：`FACES`（各状态帧）、`HAIR` / `EYE` / `SHIRT`（渐变色）、`ACCENT`（星星、问号等）。帧速在 `$.clock.every(150, …)`。
