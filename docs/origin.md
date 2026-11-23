# 这份代码从哪里来

这是从产品 `潘一琪 CLAW` 的私有主进程里**抽出来并通用化**的一部分，不是整个产品。

## 血缘（2026-11-23 核对）

```text
douya-claw 0.21.34（公开快照，522 文件）
  ├─ agent-intent-gate      兄弟：从 intentGate.js 抽出的意图/交付门
  └─ 潘一琪 CLAW（私有，未公开）
        └─ panyiqi-claw     本仓库：从私有版抽出的三负重轮 + 门禁骨架
```

几点必须说清楚：

- `panyiqi-claw` **不是**直接从 `douya-claw` 公开快照里抠出来的，中间隔了一代私有改造；
- `agent-intent-gate` 和 `panyiqi-claw` 是**兄弟**，不是父子；
- `agentEngineTiger.js`、`tigerBaseline.js`、`scripts/smoke/_exit99-watchdog.mjs`
  在 `douya-claw` 公开快照里搜不到，属于私有那一代新增/改造的文件；
- `_exit99-watchdog.mjs` 按 SANITIZATION 被排除在公开快照外，所以
  “本仓库的 watchdog 是否继承自它”**无法判定**；本仓库的实现是独立写的，
  并且这一轮修掉了“只信 markDone、不观测 sentinel”的反向假绿。

## 文件对应

| 来源 | 本仓库对应 | 做了什么 |
|---|---|---|
| `src/main/agentEngineTiger.js` | `src/tiger/engine.js` | 去掉 Electron/SSE/业务缓存，只保留 Pro → freeze → Do → machineGate → Check 状态机；Do 改为注入 |
| `src/main/agentEngineTigerPrompts.js` | `src/tiger/prompts.js` | 去掉品牌身份，只保留三只轮子的职责与 JSON 契约 |
| `src/main/tigerBaseline.js` | `src/tiger/baseline.js` | 去掉产品 userData 路径，改为可注入 `stateDir`；补 `history` 旧版本留档 |
| `scripts/smoke/_exit99-watchdog.mjs` | `src/gates/watchdog.mjs` | 独立重写：观测 stdout 的 sentinel，`markDone()` 不再单独算证据 |
| `scripts/smoke/run-unit-chain.mjs` | `src/gates/runner.mjs` | 只保留链执行 + 三档汇总，去掉产品专属的 200+ 条判据 |
| `scripts/smoke/scan-orphan-asserts.mjs` | `src/gates/scan-orphans.mjs` | 只保留“声明了 assert 但没进链”的扫描 |
| 产品里的按钮数 / 色值棘轮 | `src/gates/ratchet.mjs` | 抽成通用 `judgeRatchet` |
| `acceptanceChecklist.js` | `src/tiger/acceptance.js` | 补回 `normalizeItemResult`：声明通过但没证据 → `unknown` |
| `agent-intent-gate/src/intent-gate.js` | `src/tiger/intent-gate.js` | 补回确定性意图门：落盘动词 + 文件类名词 → `artifact-save`，不再只靠 Pro 的 `action` |
| `artifactCustody.js` / `runtimeEvidence.js` / `evidenceQuality.js` | **未完整移植** | 只保留了 `artifacts` 贯通接口 + 验收清单；完整证据链仍是参考实现之外的缺口 |

## 为什么不是整仓开源

原产品包含：

- 商业业务代码（口腔/门店/内容运营）；
- 模型网关地址、密钥、许可证、更新服务；
- 用户数据与真实客户内容。

这些不适合直接公开。这里只保留**可复用的 agent 内核**：
三只轮子的编排、冻结基准的状态机、意图门、验收清单、门禁的读数契约。
它们不依赖原产品的任何私有模块，可以单独跑、单独测。

## 和原产品的行为差异

- 原产品用 DSH / MCP 工具执行 Do；本仓库用 `runDo` 注入，demo 用 mock。
- 原产品的 machineGate 接真实编译、类型检查、文件系统；本仓库只留接口和一个 mock。
- 原产品有完整的 `artifactCustody` / `runtimeEvidence` / `evidenceQuality` 证据链；
  本仓库只保留 `artifacts` 贯通和验收清单，**这是明确的缺口**，不假装已经补齐。
- 原产品有 SSE、意图缓存、搜索、许可证；本仓库没有。
- 本仓库的提示词是通用版；原产品的品牌人设不在开源范围内。
