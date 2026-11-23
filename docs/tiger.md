# 虎式交错三负重轮

> 名字来自坦克的负重轮：三个轮子交错承重，任何一个轮子被击穿，另外两个还能把车开回去。
> 这里的“负重”是三种完全不同的责任：对齐、执行、核验。

## 1. 为什么要三个轮子

单模型一次完成“理解 + 执行 + 自检”有三个结构性问题：

1. **自检没有独立性**：同一个上下文里，模型倾向于替自己刚写的东西辩护；
2. **需求会漂移**：用户说“简单做一下”，Do 可能顺手加三个功能；
3. **失败无法分级**：做了一半、做错了、根本没做，最后都变成一句“完成了”。

三负重轮把这三件事拆开：

- Pro 只负责“把话听清”，产出可核验的基准；
- Do 只负责“按基准做”，不允许改基准；
- Check 只负责“对照基准挑错”，看不到 Do 的上下文。

## 2. 三只轮子的权责

| | Pro | Flash-Do | Flash-Check |
|---|---|---|---|
| 对用户说话 | ✅ 唯一 | ❌ | ❌ |
| 写基准 | ✅（待确认） | ❌ | ❌ |
| 冻结基准 | 用户确认后由状态机冻结 | ❌ | ❌ |
| 执行 / 写文件 | ❌ | ✅ | ❌ |
| 改文件 | ❌ | ✅（仅基准范围） | ❌ |
| 判漂移 | ❌ | ❌ | ✅ |
| 判完成 | ❌ | 自报（不可信） | ✅（先判残缺） |

## 3. 状态机

每个会话一份状态：

```json
{
  "pending": {
    "summary": "给用户看的需求摘要",
    "hard": { "params": [], "fields": [], "interfaces": [], "scope": [], "forbidden": [] },
    "soft": ["风格偏好"],
    "request": "用户原话"
  },
  "baseline": null,
  "version": 0,
  "updatedAt": "..."
}
```

转移：

```text
idle
  ├─ 咨询 / 闲聊 → answer（不产生 pending）
  └─ 真任务 → proposal（写 pending，等确认）
                  ↓ 用户确认（CONFIRM_RE）
               freeze（pending → baseline，version + 1，生成 versionId）
                  ↓
               Do → machineGate → Check
                  ↓
        delivered / blocked
```

关键约束：

- **没有 baseline 不跑 Do**：`runTigerTurn` 只在 `state.pending && CONFIRM_RE` 时冻结并执行；
- **确认优先于 Pro**：先判断“这是不是一句确认”，避免 Pro 把“可以”当成新任务又提一版摘要；
- **冻结后不可改**：`baseline` 只读；新需求生成新版本，旧版本留档。

## 4. 基准怎么切

`hard` 只放**能核验**的东西：

- `params`：参数名、类型、默认值、取值范围；
- `fields`：字段名、必填/可选、序列化形状；
- `interfaces`：函数签名、HTTP 路径、CLI 用法；
- `scope`：允许改的文件/模块；
- `forbidden`：禁止新增的依赖、禁止改的接口、禁止删的功能。

`soft` 放**偏好**：语气、排版、取舍、命名风格。

判定规则：

- 改 `hard` → 严重漂移；
- 改 `soft` → 轻微漂移，可交付但要备注；
- 基准没写、但为了跑通必须补的 → 不算“自行加功能”，算**缺口**，Do 要列出来，Check 要看到。

## 5. Do 的边界

Do 收到的 prompt 只有三块：

1. 冻结基准快照；
2. 本阶段允许写的草稿路径；
3. 用户原始请求。

它**看不到** Pro 的对话、Check 的结论、上一轮的漂移报告。这是刻意的：
Do 一旦能看到“Check 上次说我哪里错了”，就会开始迎合检查器，而不是按基准做事。

Do 的输出必须包含：

- 产物路径（绝对路径）；
- 已验证项；
- 未验证项；
- 缺口（基准没写但实现需要的东西）。

## 6. Check 的边界

Check 只能看到：

- 冻结基准；
- 机器门禁汇总（已判定的 fail 不再复核）；
- Do 的产物文本/草稿。

Check 的输出是严格 JSON：

```json
{
  "complete": true,
  "completeIssues": [],
  "severe": [],
  "minor": [],
  "notes": ""
}
```

判定顺序：

1. `complete === false` → `blocked / incomplete`，**不做漂移差分**；
2. 机器门禁 `ok === false` → `blocked / machine_gate`；
3. `severe.length > 0` → `blocked / severe_drift`；
4. 否则 → `delivered`，`minor` 作为备注。

## 7. 失败矩阵

| 现象 | 裁决 | 谁负责 |
|---|---|---|
| Pro 返回非法 JSON | `error` | 调用方重试/换模型 |
| 用户没确认就催“做吧” | 仍是 `proposal` | Pro 再要一次确认 |
| Do 抛异常 | `blocked / do_failed` | Do 执行器 |
| Do 只写一半 | `blocked / incomplete` | Check 第一层 |
| Do 偷偷加依赖 | `blocked / severe_drift` | Check 对照 `hard.forbidden` |
| 机器门禁不过 | `blocked / machine_gate` | 机器门禁 |
| Check 返回非法 JSON | `blocked / check_invalid_json` | 调用方重试/换模型 |

## 8. 什么时候不要用

- **纯问答**：不需要三只轮子，Pro 的 `answer` 分支就够了；
- **一次性脚本**：冻结基准的成本高于收益；
- **没有机器门禁的执行**：至少要有“文件存在 / 命令退出码”这类硬判据，否则 Check 只能凭文本猜；
- **低风险、可回滚的探索**：可以直接 Do，但要把“未验证”写清楚。

## 9. 实现索引

| 文件 | 作用 |
|---|---|
| `src/tiger/prompts.js` | 三套 system prompt + 上下文拼装 |
| `src/tiger/baseline.js` | pending / baseline / version 状态机 |
| `src/tiger/engine.js` | `runTigerTurn` 主编排 |
| `src/tiger/demo.js` | 离线演示 |
| `test/tiger.test.mjs` | 状态机测试 |

## 10. 一句总结

**Pro 把话听清，Do 把事做完，Check 把错挑出来；三只轮子之间只传“冻结基准”和“产物”，不传上下文。**
