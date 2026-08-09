'use strict';

/**
 * 副屏状态灯 —— 零依赖本地 HTTP 服务
 *
 * 职责：
 *  - 托管 index.html（三色灯全屏 UI）
 *  - 提供状态上报接口（POST/GET /api/state?state=...）
 *  - 提供状态查询接口（GET /state）
 *  - 通过 SSE（GET /stream）向所有连接的客户端实时广播状态变化
 *
 * 零第三方依赖，仅使用 Node 内置模块。
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { URL } = require('url');

// ============================================================
// 常量配置（如需修改端口，仅改此处即可）
// ============================================================
const PORT = 8765;
const HOST = '0.0.0.0';
const PUBLIC_DIR = __dirname;
const INDEX_FILE = path.join(PUBLIC_DIR, 'index.html');

// 合法状态集合：idle=待机, yellow=工作中, green=完成, red=需要人工介入
const VALID_STATES = new Set(['idle', 'yellow', 'green', 'red']);

// ============================================================
// 运行时状态
// ============================================================
// 当前状态（模块级变量），初始为待机
let currentState = 'idle';

// SSE 客户端连接集合，用于广播
const clients = new Set();

// ============================================================
// 工具函数
// ============================================================

/**
 * 读取 index.html 内容
 * @returns {string} HTML 文本
 */
function readIndexHtml() {
  return fs.readFileSync(INDEX_FILE, 'utf-8');
}

/**
 * 向单个 SSE 客户端推送一条事件
 * @param {http.ServerResponse} res 客户端响应对象
 * @param {object} data 事件数据（会被 JSON 序列化）
 */
function sendSseEvent(res, data) {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

/**
 * 向所有连接的 SSE 客户端广播当前状态
 * @param {string} state 当前状态
 */
function broadcast(state) {
  const payload = { state: state };
  for (const res of clients) {
    try {
      sendSseEvent(res, payload);
    } catch (err) {
      // 单条推送失败不应影响其他客户端
      clients.delete(res);
    }
  }
}

/**
 * 设置并广播状态
 * @param {string} state 目标状态
 * @returns {boolean} 是否设置成功（状态合法才成功）
 */
function setState(state) {
  if (!VALID_STATES.has(state)) {
    return false;
  }
  if (state !== currentState) {
    currentState = state;
    broadcast(currentState);
  }
  return true;
}

/**
 * 打印本机与局域网可访问地址
 */
function printAccessInfo() {
  const interfaces = os.networkInterfaces();
  const lanIps = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      // 仅收集非内部 IPv4 地址
      if (iface.family === 'IPv4' && !iface.internal) {
        lanIps.push(iface.address);
      }
    }
  }

  console.log('\n========================================');
  console.log('  副屏状态灯已启动');
  console.log('========================================');
  console.log(`  本机:   http://localhost:${PORT}`);
  if (lanIps.length > 0) {
    console.log('  手机请访问（同一局域网下）:');
    for (const ip of lanIps) {
      console.log(`          http://${ip}:${PORT}`);
    }
  } else {
    console.log('  （未检测到局域网 IP，请确认网络连接）');
  }
  console.log('========================================\n');
}

// ============================================================
// HTTP 请求处理
// ============================================================

const server = http.createServer((req, res) => {
  let parsedUrl;
  try {
    parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  } catch (err) {
    res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: '非法的请求地址' }));
    return;
  }

  const pathname = parsedUrl.pathname;
  const method = req.method;

  // ---- GET / 或 /index.html：返回 UI 页面 ----
  if (method === 'GET' && (pathname === '/' || pathname === '/index.html')) {
    try {
      const html = readIndexHtml();
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('读取 index.html 失败: ' + err.message);
    }
    return;
  }

  // ---- POST/GET /api/state?state=...：设置状态 ----
  if (pathname === '/api/state') {
    // 兼容 GET（便于调试）与 POST
    if (method !== 'GET' && method !== 'POST') {
      res.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: '仅支持 GET / POST' }));
      return;
    }
    const state = parsedUrl.searchParams.get('state');
    if (!state || !VALID_STATES.has(state)) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        error: '非法状态',
        validStates: Array.from(VALID_STATES),
      }));
      return;
    }
    setState(state);
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ state: currentState }));
    return;
  }

  // ---- GET /state：返回当前状态（便于排查） ----
  if (method === 'GET' && pathname === '/state') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ state: currentState }));
    return;
  }

  // ---- GET /stream：SSE 实时推送端点 ----
  if (method === 'GET' && pathname === '/stream') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });

    // 客户端连接后立即推送当前状态
    sendSseEvent(res, { state: currentState });
    clients.add(res);

    // 心跳：定期发送注释行，保持连接活跃，避免被代理断开
    const heartbeat = setInterval(() => {
      try {
        res.write(': ping\n\n');
      } catch (err) {
        // 忽略心跳写入错误
      }
    }, 25000);

    // 客户端断开时清理资源
    req.on('close', () => {
      clearInterval(heartbeat);
      clients.delete(res);
    });
    return;
  }

  // ---- 其他路由：404 ----
  res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ error: '未找到路由', path: pathname }));
});

// ============================================================
// 启动服务
// ============================================================
server.listen(PORT, HOST, () => {
  printAccessInfo();
});

// 优雅退出
process.on('SIGINT', () => {
  console.log('\n正在关闭副屏状态灯...');
  for (const res of clients) {
    res.end();
  }
  clients.clear();
  server.close(() => process.exit(0));
});
