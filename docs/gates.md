# 门禁系统

> 门禁不是“多写几个 assert”。门禁是一套**读数契约**：
> 跑完了没有、跑出了什么、这个红到底该改产品还是该修门禁。

## 1. 三种退出码

| 退出码 | 含义 | 外面应该做什么 |
|---|---|---|
| `0` | 跑完了，全部通过 | 继续 |
| `1` | 跑完了，有真实失败 | 改产品，或改判据 |
| `99` | **没跑完 / 读数不完整** | 本次结论作废，修门禁或重跑 |

为什么必须分开：

- 只区分 0/1 时，门禁在打印汇总行之前崩掉也退 1。外面看到的是“产品红了”，实际是“门禁没跑完”。人会去改产品，越改越偏。
- 99 是一个**明确拒绝**：不是通过，也不是失败，是“这次读数不算数”。

实现见 [`src/gates/watchdog.mjs`](../src/gates/watchdog.mjs)。

```js
import { installWatchdog } from './watchdog.mjs';

const wd = installWatchdog('UNIT-XXX SUMMARY'); // 必须最先装
// ... 跑检查、打印汇总 ...
wd.markDone();
process.exit(failed ? 1 : 0);
```

看门狗覆盖四种真正能决定退出码的时机：显式 `process.exit`、`beforeExit`、`uncaughtException`、`unhandledRejection`。
只在 `process.on('exit')` 里改 `exitCode` 是没用的：那时退出码已经定了。

## 2. 门禁链

`chain.txt` 是有序命令列表：

```text
node src/gates/selftest.mjs
node src/gates/scan-orphans.mjs
```

运行器逐条执行，最后给一份汇总：

```text
GATE CHAIN SUMMARY total=2 passed=2 failed=0 incomplete=0
```

它**不会在第一条失败时停**：一次运行要产出一份完整报告，否则后面的门禁等于没跑。
每条命令的 `exitCode`、`verdict`、耗时都会写进 `--json=` 报告。

实现见 [`src/gates/runner.mjs`](../src/gates/runner.mjs)。

## 3. 反控：判据必须能自己变红

只证明“改后是绿的”没有意义。一条判据要能证明自己有判别力，至少要有：

1. **正控**：合法输入 → 绿；
2. **负控**：构造一个必然违规的输入 → 必须红；
3. **还原**：把违规输入去掉 → 重新绿。

没有负控的判据，很可能只是“永远为真”。
本仓库的 `test/gates.test.mjs` 里有两个最小例子：

- `ratchet blocks an increase`：把指标 +1，断言必须 `ok === false`；
- `watchdog turns "no summary line" into exit 99`：子进程不打汇总行，断言退出码必须是 99。

## 4. 棘轮：只许降不许升

按钮数、硬编码色值、包体积、首屏 DOM 数……这类指标一旦“今天加一个、明天加一个”，
很快就会回到按钮墙。做法是把当前值写进基线，之后：

- 比基线小 → 通过；
- 等于基线 → 通过；
- 比基线大 → **红**，必须显式改基线并写明理由。

实现见 [`src/gates/ratchet.mjs`](../src/gates/ratchet.mjs)：

```js
judgeRatchet({ current: 7, baseline: 7 }); // ok
judgeRatchet({ current: 6, baseline: 7 }); // ok
judgeRatchet({ current: 8, baseline: 7 }); // fail
```

棘轮基线不是“不许改”，是“改可以，但要在 diff 里看得见”。

## 5. 孤儿门禁：声明了 assert，但没人跑

一个脚本写了 `LIFETIME: assert`，却不在 `chain.txt` 里，
它在仓库里看起来像覆盖，实际上从来没执行过。这比没有门禁更危险。

`scan-orphans.mjs` 做两件事：

- 扫源码目录里所有带 `LIFETIME: assert` 的文件；
- 检查它的相对路径是否出现在 `chain.txt` 的命令里。

没有出现 → 退出 1，并打印孤儿文件。

实现见 [`src/gates/scan-orphans.mjs`](../src/gates/scan-orphans.mjs)。

## 6. 门禁的常见退化形态

| 退化形态 | 为什么是假绿 | 怎么防 |
|---|---|---|
| 拿源码里“出现过某个字符串”当接线证据 | 下一行写个 `x = []` 就绕过去了 | 真跑一次，读运行时读数 |
| 夹具撑不爆上限，于是 `<= 上限` 永远成立 | 没测到边界 | 构造刚好超限的夹具 |
| 夹具和正则同源 | 自己出题自己考 | 用另一份独立数据 |
| 只加断言条数，不证明能红 | 覆盖面是形态集，不是条数 | 每个新判据做一次变异 |
| 变异没生效（锚点/取值口径不匹配） | 变异体和基线逐字相同 | 先自证“同一输入下两版输出不同” |
| 手写结论标签与值同屏 | 人只读括号里的字 | 标签也必须算出来 |

## 7. 推荐的最小落地顺序

1. 先给每个门禁装 `watchdog`，把“没跑完”从 1 里分出来；
2. 写 `chain.txt` + 运行器，保证所有门禁一次跑完；
3. 加 `scan-orphans`，防止“写了但没接”；
4. 给最容易被破坏的指标加棘轮；
5. 每加一条判据，补一个负控。

## 8. 和虎式负重轮的关系

虎式负重轮的 `machineGate` 就是一个门禁函数：

```js
machineGate: async ({ baseline, output }) => ({
  ok: true,
  summary: '文件存在 / 类型检查通过 / 没有禁用依赖',
  failures: [],
})
```

门禁负责“能机器判的”，Check 负责“必须语义判的”。
两边都失败时，`machine_gate` 优先阻断——因为机器读数比模型自述可信。
