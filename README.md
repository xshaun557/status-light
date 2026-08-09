# 🔆 副屏状态灯 · status-light

> 把一台旧手机（或任意浏览器标签页）变成 WorkBuddy 工作状态的「物理状态牌」：黄 = 工作中、红 = 需要你介入、绿 = 已完成、灰 = 待机。零依赖、零框架、纯本地。

![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen)
![Zero Dependencies](https://img.shields.io/badge/dependencies-0-blue)
![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey)

## ✨ 功能特性

- 🟡🔴🟢 **三色状态灯**：工作中 / 需介入 / 已完成，外加灰色待机态
- 📱 **副屏实时跟随**：手机浏览器全屏常亮，状态变化经 SSE 实时推送，毫秒级变色
- 🔌 **零依赖**：一个 Node 进程 + 一个 HTML 文件，无任何第三方包，拷贝即跑
- 🔄 **横竖屏自适应**：自动适配手机横屏（灯横排）与竖屏（灯竖排）
- 🗣️ **原生语音播报**：状态切换时手机朗读提示，可一键静音（iOS 需先点一下页面解锁语音）
- 🤖 **打灯约定**：内置「收到消息→黄、问前→红、交付→绿、空闲→idle」的切灯规范，助理按约定自动切灯
- 🧪 **内置自测**：40 项零依赖自动化测试（后端 6 + 前端 34），可重复运行

## 🧩 工作原理（先读，避免误解）

本技能由两部分组成：

- **状态服务 `server.js`**：机器级 Node 进程，监听 `0.0.0.0:8765`，只认 curl 命令，**自己不会感知 WorkBuddy**。只要进程活着，任意任务 / 终端都能通过 `localhost:8765` 切灯——它是跨任务共享的「灯控总线」。
- **打灯约定**（见 `SKILL.md`）：一份给「当前对话的助理」看的行为规范。灯色变化**完全依赖该对话的助理按约定主动 curl**。

> ⚠️ **它不是后台守护进程，也不会自动监听你所有任务。** WorkBuddy 没有开放「任务状态」事件接口，所以不存在全局自动触发。任何一个新开的任务，只有当「那个任务的助理」加载并遵循约定时，灯才会亮。

## 🚀 快速开始

```bash
# 1. 安装运行时（把文件复制到 ~/.workbuddy/status-light-runtime/）
node <技能目录>/scripts/setup.mjs

# 2. 启动服务
node ~/.workbuddy/status-light-runtime/server.js
```

手机连同一 Wi-Fi，浏览器打开控制台打印的局域网地址（如 `http://10.x.x.x:8765`）即可。

## 📖 详细用法

### 状态含义

| 状态      | 含义                         |
|-----------|------------------------------|
| 黄 yellow | 工作中（WorkBuddy 正在执行） |
| 绿 green  | 完成（任务已交付）           |
| 红 red    | 需要你介入（正等输入）       |
| 灰 idle   | 待机 / 空闲                  |

### 在任意任务启用（三选一，按稳妥程度）

1. **任务开头说一句话（最稳、即时）**：在想用状态灯的任务里说「用副屏状态灯」或「加载 status-light 技能」。
2. **长期记忆规则（推荐长期使用）**：在 `~/.workbuddy/MEMORY.md` 加一条，例如：
   > 需要状态灯时主动 `Skill status-light` 加载，并按约定切灯：收到用户消息→黄、准备问用户→红、交付→绿、空闲→idle。
   优点：本机所有对话的助理读到都会自觉接管；缺点：是否执行取决于该助理是否遵循，属软约束。
3. **手动切灯（调试 / 演示，不依赖助理）**：直接用下面的 curl 命令。

> 没亮先排查：① `curl -s localhost:8765/state` 能否返回 JSON（服务是否在跑）；② 该任务是否真的加载并遵循了约定。

### 手动切灯

```bash
curl -s "http://localhost:8765/api/state?state=yellow"   # 工作中
curl -s "http://localhost:8765/api/state?state=red"      # 需要你介入
curl -s "http://localhost:8765/api/state?state=green"    # 完成
curl -s "http://localhost:8765/api/state?state=idle"     # 待机
```

PowerShell 备选：`powershell -ExecutionPolicy Bypass -File <运行目录>/set-state.ps1 yellow`

## 🔌 接口速查

| 接口                                          | 说明                          |
|-----------------------------------------------|-------------------------------|
| `POST/GET /api/state?state=yellow\|green\|red\|idle` | 设置状态（非法值返回 400） |
| `GET /state`                                  | 读取当前状态 JSON             |
| `GET /stream`                                 | SSE 实时推送状态变化          |
| `GET /` 或 `/index.html`                      | 返回三色灯页面                |

## 🧪 自测

```bash
node qa-test.mjs       # 后端接口 + SSE 广播（6 用例）
node qa-ui-check.mjs   # 前端布局 / 媒体查询静态校验（34 项）
```

## 📦 发布与分发

- **WorkBuddy 技能市场**：平台暂无自动发布入口，分发方式为分享 `status-light.zip`，对方解压到 `~/.workbuddy/skills/status-light/` 即生效。
- **GitHub**：本仓库即技能根目录，clone 后把内容放到 `~/.workbuddy/skills/status-light/` 即可。

## 📁 目录结构

```
status-light/
├── server.js            # 零依赖状态服务（HTTP + SSE）
├── index.html           # 三色灯全屏单文件页面
├── package.json         # npm start = node server.js
├── set-state.ps1        # Windows 一键切灯脚本
├── scripts/setup.mjs    # 运行时安装器（幂等）
├── qa-test.mjs          # 后端自动化测试
├── qa-ui-check.mjs      # 前端静态校验
├── SKILL.md             # 技能说明 + 打灯约定（给助理看）
└── README.md            # 本文件
```

📄 本技能仅供自用与自由分发，未附加正式开源许可证。
