# 潘一琪 CLAW · Agent Kernel

这是从 **潘一琪 CLAW** 里抽出来的 agent 内核，开源两件事：

1. **虎式交错三负重轮**：Pro / Flash-Do / Flash-Check 三个轮子怎么分工、怎么冻结基准、怎么阻断漂移；
2. **门禁系统**：单元门禁怎么串成链，为什么用 `0 / 1 / 99` 三种退出码，怎么做反控和棘轮。

代码是**可独立运行的参考实现**，不依赖原产品的 Electron / DSH / 数据库，也不含任何业务数据、API Key、服务器地址。

```text
用户
  ↓
Pro（唯一对用户说话）
  ├─ 咨询 / 闲聊 → 直接回答
  └─ 真任务 → 需求摘要（硬规约 + 软期望）→ 等用户确认
                                      ↓ 确认
                              冻结基准（版本 ID 锁定）
                                      ↓
                          Flash-Do（只按基准产出）
                                      ↓
                          机器门禁（能机器判的先判）
                                      ↓
                          Flash-Check（只读基准 + Do 输出）
                                      ↓
              无/轻微漂移 → 交付（附备注）
              严重漂移    → 阻断
              Do 残缺     → 阻断
```

## 为什么不是“一个 Agent 一把梭”

小模型单次输出不稳定：会漏字段、会偷偷加需求、会把没验证的说成已验证。
与其要求“一次做对”，不如把一次任务拆成三个**权责隔离**的轮子：

| 轮子 | 能做什么 | 不能做什么 |
|---|---|---|
| **Pro** | 对齐需求、写摘要、生成硬/软基准 | 不执行、不写文件 |
| **Flash-Do** | 按冻结基准产出 | 不改基准、不加基准未写的功能 |
| **Flash-Check** | 先判残缺，再做漂移差分 | 不改文件、不重新设计、不替 Do 补做 |

关键不是“多调几次模型”，而是**基准在 Do 之前冻结**：
Pro 把可核验的约束写成 `hard`，把风格偏好写成 `soft`；用户确认后，Do 和 Check 都只读这份快照。
Do 想偷偷加功能，Check 能对照 `hard.forbidden` 抓出来；Check 想放水，机器门禁已经先把能机器判的判了。

详细设计见 [docs/tiger.md](docs/tiger.md)；
这份代码从哪些文件抽出来、为什么不是整仓开源，见 [docs/origin.md](docs/origin.md)。

## 案例：同样 DeepSeek V4 Flash，差距在哪

详见 [docs/cases.md](docs/cases.md)。两个可复现的点：

- **AI 客服换说法就掉知识库**：问题不在模型，在召回层只做字面匹配。
  本仓库带一个可跑实验：`node examples/ai-cs-paraphrase/gate.mjs`。
  同一批 12 条问法、同一份知识库、不调用模型：naive 检索命中 8/12，归一化检索命中 12/12。
- **漏洞定位**：先列攻击面、构造两个租户的最小请求、做差分，拿到机器证据再修；
  修完把请求写进门禁链，去掉校验就必须变红。
  可跑实验：`node examples/tenant-isolation/gate.mjs`。

也要把边界写清楚：**通用基建（多租户、可观测性、部署、生态、企业管控）WorkBuddy 更强**。
这个仓库强的是“已知问题、需要确定性修复、必须防回归”的最后一公里，不是整体碾压。

## 为什么门禁要单独做

门禁不是“多写几个 assert”。它要解决三个具体问题：

- **“跑挂了”和“跑出真失败”必须分开**：两者都退出 1，外面就分不清该改产品还是该修门禁。
- **“没跑到汇总行”不能算通过**：所以有退出码 **99**（读数不完整）。
- **门禁自己也会退化成摆设**：所以要有反控（变异必须变红）、棘轮（只许降不许升）、孤儿扫描（声明了 assert 但没进链）。

本仓库带一个最小但完整的门禁工具包：

```bash
npm run gates
```

它会跑 `examples/chain.txt`，并给出 `passed / failed / incomplete` 三档读数。

详细约定见 [docs/gates.md](docs/gates.md)。

## 快速开始

要求 Node.js >= 20，零依赖。

```bash
# 1. 跑测试（虎式状态机 + 门禁工具）
npm test

# 2. 跑离线 demo：不联网、不调模型，看三只轮子怎么走
npm run demo

# 3. 跑门禁链
npm run gates
```

`npm run demo` 会演示：

- 新任务只生成 `pending` 摘要，不执行；
- 用户回“可以”才冻结基准并跑 Do / Check；
- Do 残缺 → `blocked / incomplete`；
- Check 发现严重漂移 → `blocked / severe_drift`。

## 目录

```text
src/tiger/
  prompts.js    Pro / Do / Check 三套系统提示词与上下文拼装
  baseline.js   pending → frozen baseline 的状态机（按会话落盘）
  engine.js     runTigerTurn：确认、冻结、执行、机器门禁、Check、三态裁决
  demo.js       离线 demo（mock 模型 + mock Do）

src/gates/
  watchdog.mjs       退出码 99：没打汇总行就不算跑完
  runner.mjs         chain.txt 运行器（0/1/99 三档）
  ratchet.mjs        棘轮判据（只许降不许升）
  scan-orphans.mjs   扫“声明了 assert 但没进链”的孤儿门禁
  assert.mjs         最小断言与汇总行

test/                 node:test，无第三方测试框架
examples/chain.txt   示例门禁链
docs/                设计说明
```

## 接入真实模型 / 执行器

`runTigerTurn` 不绑定任何模型供应商。你只需要注入三个函数：

```js
import { runTigerTurn } from './src/tiger/engine.js';

const result = await runTigerTurn({
  messages,
  sessionId: 'user-42',
  model: async ({ role, system, user }) => {
    // role: 'pro' | 'check'
    // 调你自己的模型网关，返回纯文本
  },
  runDo: async ({ baseline, request, prompt }) => {
    // 真正的执行器：可以有工具、文件、沙箱
    // 返回 { text, artifacts? }
    return { text: '...' };
  },
  machineGate: async ({ baseline, output }) => {
    // 可选：能机器判的检查（文件是否存在、类型能否编译、有没有禁用依赖）
    return { ok: true, summary: '...' };
  },
});
```

`result.kind` 只有四种：`answer` / `proposal` / `delivered` / `blocked`。
`blocked` 一定带 `reason` 和 `issues`，不把“没做完”包装成“完成”。

## 设计原则

1. **先冻结，再执行**：没有 `baseline.versionId` 就不跑 Do。
2. **机器能判的不交给模型判**：类型、文件存在性、依赖、数量上限先走机器门禁。
3. **Check 只读**：Check 看不到 Do 的对话和缓存，只看基准、机器汇总、Do 产物。
4. **三态裁决**：`delivered` / `blocked` / `error`；没有“基本可以”。
5. **门禁要能红**：新增或修改判据，必须构造一个变异让它自己变红；只加断言条数不算覆盖。
6. **棘轮只许降不许升**：按钮数、硬编码色值、包体积这类指标，涨了就要显式改基线。
7. **没有证据 ≠ 通过**：门禁崩溃/提前退出是 99，不是 0。

## 和 agent-intent-gate 的关系

[agent-intent-gate](https://github.com/chickenboy-jyc/agent-intent-gate) 抽的是“意图门 + 交付门”；
这个仓库抽的是**三负重轮的编排**和**门禁链的运行契约**。
两者可以独立使用，也可以拼在一起：意图门决定“这轮要不要动手”，三负重轮决定“动手时怎么不跑偏”。

## 状态

这是参考实现，不是原产品的完整运行时。没有包含：

- Electron 主进程 / 渲染层；
- DSH / 工具协议 / MCP 桥；
- 业务数据库、许可证、更新服务；
- 任何真实 API Key、内网地址、用户数据。

原产品里的 `machineGate` 会接真实编译、类型检查、文件系统检查；本仓库只保留接口和一个 mock。

## License

MIT
