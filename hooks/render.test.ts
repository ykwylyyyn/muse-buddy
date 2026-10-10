import { test, expect } from 'claude-code/testing'

const props = (maxRows: number) =>
  ({ hasSurvey: false, isWorking: false, maxRows, bodyColumns: 120, scroll: { offset: 0, bodyRows: maxRows }, view: {} }) as never

// 引擎按 terminal 的元素表校验整棵树，校验不过 mount 会直接拒绝
for (const surface of ['terminal', 'desktop'] as const) {
  test(`${surface} 上能画出小人`, async $ => {
    const m = await $.ui.mount({ plugin: 'muse-buddy', surface, component: 'AbovePrompt', props: props(40) })
    const tree = JSON.stringify(await m.drawn())
    expect(tree.includes('随时待命～')).toBe(true)
    expect(tree.includes('\\___/')).toBe(true)
  })
}
