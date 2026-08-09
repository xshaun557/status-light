# 副屏状态灯（status-light）· 使用与部署

把一台旧手机（或任意浏览器标签页）变成 WorkBuddy 工作状态的指示灯。电脑上跑一个**零第三方依赖**的本地 Node 服务，手机浏览器全屏打开后实时显示红 / 黄 / 绿三色灯。

本文件是技能自带的使用说明（与 `SKILL.md` 配套）。所有运行时文件都随技能打包在技能根目录内，无需从外部仓库拷贝。

## 状态含义
- 黄 `yellow` = 工作中（WorkBuddy 正在执行任务）
- 绿 `green` = 完成（任务已交付）
- 红 `red` = 需要你介入（WorkBuddy 正等用户输入）
- 灰 `idle` = 待机 / 空闲

## 一、部署（一次性）
电脑已装 Node.js（建议 v18+，本机用 v22 验证）；旧手机能开浏览器；电脑与手机连同一个 Wi-Fi。

**方式 A — 专用运行目录（推荐）**

1. 安装运行时（在任意终端）：
   ```bash
   node <技能目录>/scripts/setup.mjs
   ```
   脚本会把 `server.js` / `index.html` / `package.json` / `set-state.ps1` 复制到
   `~/.workbuddy/status-light-runtime/`（已存在则覆盖，幂等）。可用 `--dir <路径>` 指定其他位置。

2. 启动服务：
   ```bash
   node ~/.workbuddy/status-light-runtime/server.js
   ```

**方式 B — 直接从技能目录运行**
   ```bash
   node <技能目录>/server.js
   ```
   `<技能目录>` 通常为 `~/.workbuddy/skills/status-light/`。

启动后控制台会打印本机地址（`http://localhost:8765`）和手机访问地址（如 `http://10.x.x.x:8765`）。
想常驻：把启动命令放进 Windows 任务计划程序设开机自启即可。

防火墙：若手机打不开页面，去 Windows 防火墙放行 `node` 程序的入站（端口 8765 / TCP）。

## 二、手机端使用
1. 手机浏览器打开控制台显示的局域网地址。
2. 页面会自动尝试全屏 + 屏幕常亮（Screen Wake Lock API）。
3. 若被系统拦截：点页面上的「进入全屏」按钮，并在手机设置里关闭自动锁屏。
4. 之后页面会实时跟随状态变色。

## 三、手动切灯（调试或直接控制）
PowerShell（运行目录内）：
```powershell
powershell -File set-state.ps1 yellow   # 还可填 green / red / idle
```
或用任意能发 HTTP 的工具：
```bash
curl "http://localhost:8765/api/state?state=yellow"
```

## 四、让 WorkBuddy 自动打灯（先理解原理，避免踩坑）
**原理**：灯色变化依赖"当前对话的助理"按 `SKILL.md` 的约定主动切灯；本技能不是后台守护进程，也不会自动监听你所有任务。WorkBuddy 没有开放"任务状态"事件接口，所以不存在全局自动触发。

**三种启用方式（按稳妥程度）**：
1. 任务开头说「用副屏状态灯」或「加载 status-light 技能」——最稳、即时。
2. 在跨项目长期记忆（`~/.workbuddy/MEMORY.md`）加规则：
   "需要状态灯时主动 `Skill status-light` 加载并按约定（收到消息→黄、问前→红、交付→绿）切灯。"
   优点：本机所有对话的助理读到都会自觉接管；缺点：是否执行取决于该助理是否遵循长期记忆，属软约束。
3. 手动切灯（调试 / 演示）：直接用第三节的 curl / `set-state.ps1`，不依赖助理。

**没亮先排查**：① 服务是否在跑——`curl -s localhost:8765/state` 能返回 JSON 即正常；② 该任务是否真的加载并遵循了约定。状态服务没启动时，助理会静默跳过，不影响正常任务。

## 五、接口速查
| 接口 | 说明 |
|------|------|
| `POST/GET /api/state?state=yellow\|green\|red\|idle` | 设置状态（非法值返回 400） |
| `GET /state` | 读取当前状态 JSON |
| `GET /stream` | SSE 实时推送状态变化 |
| `GET /` 或 `/index.html` | 返回三色灯页面 |

## 六、自测
在技能目录或运行目录执行：
```bash
node qa-test.mjs        # 后端接口 + SSE 广播（6 用例）
node qa-ui-check.mjs    # 前端布局 / 媒体查询静态校验（24 项）
```
两项均零依赖、可重复运行、干净退出子进程。前端灯效 / 常亮 / 全屏属真机视觉行为，需人工在手机确认。

## 七、发布与分发
本技能是自包含的用户级技能，可直接分发或发布。

- **WorkBuddy 技能市场**：平台目前没有自动发布入口，分发方式为分享打包好的 `status-light.zip`（技能根目录整体打包）。对方把压缩包解压到 `~/.workbuddy/skills/status-light/` 即生效。
- **GitHub**：将技能根目录初始化为 Git 仓库后提交、推送即可。仓库建议包含：运行时与文档（`server.js` / `index.html` / `package.json` / `set-state.ps1` / `scripts/` / `*.md`）；测试脚本 `qa-test.mjs` / `qa-ui-check.mjs` 可选纳入。

发布前检查清单：
1. 文档（SKILL.md / README.md）说明完整，描述与实现一致（尤其是"非自动守护进程"的原理）。
2. `node qa-test.mjs` 与 `node qa-ui-check.mjs` 全部通过。
3. `scripts/setup.mjs` 可幂等复制运行时文件。
4. 重新打包 `status-light.zip`，确保含最新文件。
