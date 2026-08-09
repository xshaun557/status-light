/**
 * 副屏状态灯 —— 零依赖自动化测试（QA）
 *
 * 测试策略：
 *  - 以子进程方式启动 server.js（使用受管 node 可执行文件，回退到 PATH 中的 node）。
 *  - 轮询 GET /state 直到服务开始监听 8765（或超时）。
 *  - 逐项执行用例（a~f），全部使用 Node 内置模块（node:child_process / node:http /
 *    node:assert）。
 *  - 测试结束务必杀掉子进程，避免遗留僵尸。
 *  - 前端 UI（index.html 的灯显示 / Wake Lock 常亮 / 全屏）无法在无头环境自动验证，
 *    需人工在手机/浏览器确认，本测试不覆盖。
 *
 * 运行：node qa-test.mjs
 */

import { spawn } from 'node:child_process';
import http from 'node:http';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 8765;
const BASE = `http://localhost:${PORT}`;
const SERVER_JS = path.join(__dirname, 'server.js');

// 优先使用环境变量指定的 node 可执行文件，回退到 PATH 中的 node
const NODE_BIN = process.env.STATUS_LIGHT_NODE_BIN || 'node';

// ---------------- 基础 HTTP 请求封装 ----------------
function request(method, urlPath, options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      BASE + urlPath,
      { method, ...options },
      (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () =>
          resolve({ status: res.statusCode, headers: res.headers, body })
        );
      }
    );
    req.on('error', reject);
    req.end();
  });
}

// 等待服务就绪（轮询 GET /state）
function waitForServer(timeoutMs = 10000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = () => {
      request('GET', '/state')
        .then(() => resolve())
        .catch((err) => {
          if (Date.now() - start > timeoutMs) {
            reject(new Error('服务启动超时（10s 内未能监听 8765）'));
          } else {
            setTimeout(attempt, 200);
          }
        });
    };
    attempt();
  });
}

// 设置状态（POST /api/state?state=...）
async function setState(state) {
  return request('POST', `/api/state?state=${encodeURIComponent(state)}`);
}

// ---------------- SSE 客户端 ----------------
function openSse() {
  return new Promise((resolve, reject) => {
    const req = http.get(BASE + '/stream', (res) => {
      let buffer = '';
      let pendingData = '';
      const states = [];

      res.on('data', (chunk) => {
        buffer += chunk.toString();
        let idx;
        while ((idx = buffer.indexOf('\n')) !== -1) {
          const line = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 1);

          if (line.startsWith(':')) {
            // SSE 注释行（如心跳 ": ping"），忽略
            continue;
          } else if (line.startsWith('data:')) {
            const data = line.slice(5).trim();
            if (data) pendingData = data; // 本项目为单行 data
          } else if (line === '') {
            // 事件结束（空行）
            if (pendingData) {
              try {
                const parsed = JSON.parse(pendingData);
                if (typeof parsed.state === 'string') {
                  states.push(parsed.state);
                }
              } catch (e) {
                /* 忽略解析错误 */
              }
              pendingData = '';
            }
          }
        }
      });

      resolve({ req, res, getStates: () => states });
    });
    req.on('error', reject);
  });
}

// 等待条件成立（轮询状态数组）
function waitForCondition(predicate, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      let ok = false;
      try {
        ok = predicate();
      } catch (e) {
        ok = false;
      }
      if (ok) return resolve();
      if (Date.now() - start > timeoutMs) {
        return reject(new Error('等待条件超时（5s）'));
      }
      setTimeout(check, 50);
    };
    check();
  });
}

// ---------------- 子进程管理 ----------------
let child = null;

function startServer() {
  child = spawn(NODE_BIN, [SERVER_JS], {
    cwd: __dirname,
    stdio: ['ignore', 'ignore', 'ignore'],
  });
  child.on('error', (err) => {
    console.error('[QA] 子进程启动失败:', err.message);
  });
}

async function killServer() {
  if (!child) return;
  return new Promise((resolve) => {
    const onExit = () => resolve();
    child.once('exit', onExit);
    // 先尝试 SIGINT（server.js 已注册优雅退出），失败则强杀
    child.kill('SIGINT');
    setTimeout(() => {
      try {
        child.kill('SIGKILL');
      } catch (e) {
        /* 已退出 */
      }
      setTimeout(() => {
        // 兜底，避免卡住
        resolve();
      }, 500);
    }, 2000);
  });
}

// ---------------- 测试运行器 ----------------
let pass = 0;
let fail = 0;
const failures = [];

async function test(name, fn) {
  try {
    await fn();
    pass++;
    console.log(`  PASS  ${name}`);
  } catch (e) {
    fail++;
    failures.push({ name, error: e.message });
    console.log(`  FAIL  ${name}: ${e.message}`);
  }
}

// ---------------- 主流程 ----------------
async function main() {
  console.log('========================================');
  console.log('  副屏状态灯 自动化测试 (QA)');
  console.log(`  Node 可执行文件: ${NODE_BIN}`);
  console.log('========================================');

  startServer();
  await waitForServer();
  console.log('服务已就绪 (http://localhost:8765)\n');

  // a. GET / 返回 200，且包含三色灯标记
  await test('a. GET / 返回 200 且含三色灯标记', async () => {
    const res = await request('GET', '/');
    assert.strictEqual(res.status, 200, `期望 200，实际 ${res.status}`);
    assert.ok(/text\/html/.test(res.headers['content-type'] || ''), 'Content-Type 应为 text/html');
    for (const marker of ['light-red', 'light-yellow', 'light-green']) {
      assert.ok(res.body.includes(marker), `响应体缺少三色灯标记: ${marker}`);
    }
  });

  // b. GET /index.html 返回 200 且为同一页面内容
  await test('b. GET /index.html 返回 200 且与 GET / 内容一致', async () => {
    const root = await request('GET', '/');
    const idx = await request('GET', '/index.html');
    assert.strictEqual(idx.status, 200, `期望 200，实际 ${idx.status}`);
    assert.strictEqual(idx.body, root.body, 'GET /index.html 与 GET / 内容应一致');
  });

  // c. POST /api/state?state=yellow → 200，GET /state 读回 yellow
  await test('c. POST /api/state?state=yellow 生效，GET /state 读回 yellow', async () => {
    const set = await setState('yellow');
    assert.strictEqual(set.status, 200, `设置期望 200，实际 ${set.status}`);
    const cur = await request('GET', '/state');
    assert.strictEqual(cur.status, 200);
    const data = JSON.parse(cur.body);
    assert.strictEqual(data.state, 'yellow', `当前状态应为 yellow，实际 ${data.state}`);
  });

  // d. green / red / idle 同样生效
  await test('d. POST green/red/idle 均生效，GET /state 可读取', async () => {
    for (const s of ['green', 'red', 'idle']) {
      const set = await setState(s);
      assert.strictEqual(set.status, 200, `${s} 设置期望 200，实际 ${set.status}`);
      const cur = await request('GET', '/state');
      const data = JSON.parse(cur.body);
      assert.strictEqual(data.state, s, `当前状态应为 ${s}，实际 ${data.state}`);
    }
  });

  // e. 非法值 purple → 400（且当前状态不变，仍应为 idle）
  await test('e. POST /api/state?state=purple 返回 400', async () => {
    const set = await setState('purple');
    assert.strictEqual(set.status, 400, `非法状态期望 400，实际 ${set.status}`);
    const cur = await request('GET', '/state');
    const data = JSON.parse(cur.body);
    assert.strictEqual(data.state, 'idle', `非法设置后状态应保持 idle，实际 ${data.state}`);
  });

  // f. SSE 广播：两个连接各自先收初始状态，POST 改变状态后两者都收到新状态
  await test('f. SSE 双连接广播：两连接均收到初始与变更后的状态', async () => {
    // 将状态重置为 idle，保证与后续 POST 值不同（从而触发广播）
    await setState('idle');

    const clientA = await openSse();
    const clientB = await openSse();

    // 各自先收到一条初始状态事件
    await waitForCondition(() => clientA.getStates().length >= 1);
    await waitForCondition(() => clientB.getStates().length >= 1);
    assert.strictEqual(clientA.getStates()[0], 'idle', 'A 初始状态应为 idle');
    assert.strictEqual(clientB.getStates()[0], 'idle', 'B 初始状态应为 idle');

    // POST 改变状态（idle -> yellow，触发广播）
    const set = await setState('yellow');
    assert.strictEqual(set.status, 200);

    // 两个连接都应收到新的 yellow 状态事件
    await waitForCondition(() => clientA.getStates().includes('yellow'));
    await waitForCondition(() => clientB.getStates().includes('yellow'));

    // 关闭连接，便于服务清理资源
    clientA.req.destroy();
    clientB.req.destroy();
  });

  console.log('\n----------------------------------------');
  console.log(`  测试结果: 通过 ${pass} / 失败 ${fail} （共 ${pass + fail}）`);
  console.log('----------------------------------------');

  if (fail > 0) {
    console.log('失败用例:');
    for (const f of failures) {
      console.log(`  - ${f.name}: ${f.error}`);
    }
  }

  return fail === 0;
}

// 确保无论成功失败都清理子进程
main()
  .then((ok) => {
    return killServer().then(() => {
      process.exit(ok ? 0 : 1);
    });
  })
  .catch(async (err) => {
    console.error('\n[QA] 测试运行异常:', err);
    await killServer();
    process.exit(1);
  });
