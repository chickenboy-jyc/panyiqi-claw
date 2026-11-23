# 这份代码从哪里来

这是从产品 `潘一琪 CLAW` 的私有主进程里**抽出来并通用化**的一部分，不是整个产品。

| 原产品文件 | 本仓库对应 | 做了什么 |
|---|---|---|
| `src/main/agentEngineTiger.js` | `src/tiger/engine.js` | 去掉 Electron/SSE/业务缓存，只保留 Pro → freeze → Do → machineGate → Check 状态机；Do 改为注入 |
| `src/main/agentEngineTigerPrompts.js` | `src/tiger/prompts.js` | 去掉品牌身份，只保留三只轮子的职责与 JSON 契约 |
| `src/main/tigerBaseline.js` | `src/tiger/baseline.js` | 去掉产品 userData 路径，改为可注入 `stateDir` |
| `scripts/smoke/_exit99-watchdog.mjs` | `src/gates/watchdog.mjs` | 重写为更小的独立实现，保留 0/1/99 契约 |
| `scripts/smoke/run-unit-chain.mjs` | `src/gates/runner.mjs` | 只保留链执行 + 三档汇总，去掉产品专属的 200+ 条判据 |
| `scripts/smoke/scan-orphan-asserts.mjs` | `src/gates/scan-orphans.mjs` | 只保留“声明了 assert 但没进链”的扫描 |
| 产品里的按钮数 / 色值棘轮 | `src/gates/ratchet.mjs` | 抽成通用 `judgeRatchet` |

## 为什么不是整仓开源

原产品包含：

- 商业业务代码（口腔/门店/内容运营）；
- 模型网关地址、密钥、许可证、更新服务；
- 用户数据与真实客户内容。

这些不适合直接公开。这里只保留**可复用的 agent 内核**：
三只轮子的编排、冻结基准的状态机、门禁的读数契约。
它们不依赖原产品的任何私有模块，可以单独跑、单独测。

## 和原产品的行为差异

- 原产品用 DSH / MCP 工具执行 Do；本仓库用 `runDo` 注入，demo 用 mock。
- 原产品的 machineGate 接真实编译、类型检查、文件系统；本仓库只留接口和一个 mock。
- 原产品有 SSE、意图缓存、搜索、许可证；本仓库没有。
- 本仓库的提示词是通用版；原产品的品牌人设不在开源范围内。
