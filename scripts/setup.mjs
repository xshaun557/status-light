/**
 * 副屏状态灯 —— 零依赖安装脚本
 *
 * 将技能运行所需的 4 个文件从技能根目录复制到运行目录，
 * 使技能可在任意机器上自包含运行，无需保留完整技能目录。
 *
 * 设计原则：
 *  - 仅使用 Node 内置模块（fs / path / os / url），无任何第三方依赖。
 *  - 幂等：运行目录已存在文件则覆盖，可重复执行。
 *  - 可移植：运行目录默认基于 os.homedir()，支持 --dir 覆盖。
 *
 * 用法：
 *   node scripts/setup.mjs               # 默认安装到 ~/.workbuddy/status-light-runtime/
 *   node scripts/setup.mjs --dir <path>  # 自定义运行目录
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

// 当前脚本所在目录（scripts/），其上一级即为技能根目录（源文件目录）
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SOURCE_DIR = path.join(__dirname, '..');

// 待复制的运行文件清单
const FILES_TO_COPY = ['server.js', 'index.html', 'package.json', 'set-state.ps1'];

// 服务监听端口（与 server.js 保持一致，仅用于打印手机访问地址）
const SERVER_PORT = 8765;

/**
 * 解析运行目录：
 *  - 若命令行提供 --dir <path>，使用该路径（相对路径按 cwd 解析为绝对路径）。
 *  - 否则回退到用户主目录下的默认路径 <homedir>/.workbuddy/status-light-runtime/。
 * @param {string[]} argv 已剔除 node/script 后的命令行参数
 * @returns {string} 运行目录绝对路径
 */
function resolveRuntimeDir(argv) {
  const dirFlagIndex = argv.indexOf('--dir');
  if (dirFlagIndex !== -1 && argv[dirFlagIndex + 1]) {
    return path.resolve(argv[dirFlagIndex + 1]);
  }
  return path.join(os.homedir(), '.workbuddy', 'status-light-runtime');
}

/**
 * 列出所有非内部 IPv4 地址，供手机访问提示使用。
 * @returns {string[]} 局域网 IPv4 地址列表
 */
function getLanIpList() {
  const interfaces = os.networkInterfaces();
  const lanIps = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      // 仅收集非内部（非回环）IPv4 地址
      if (iface.family === 'IPv4' && !iface.internal) {
        lanIps.push(iface.address);
      }
    }
  }
  return lanIps;
}

/**
 * 幂等复制单个文件（已存在则覆盖）。
 * @param {string} file 文件名
 * @param {string} runtimeDir 运行目录
 */
function copyRuntimeFile(file, runtimeDir) {
  const src = path.join(SOURCE_DIR, file);
  const dest = path.join(runtimeDir, file);
  if (!fs.existsSync(src)) {
    throw new Error(`源文件缺失，无法复制: ${src}`);
  }
  fs.copyFileSync(src, dest);
  console.log(`  已复制: ${file}`);
}

/**
 * 主流程：解析目录 → 复制文件 → 打印结果。
 * 任何复制/创建错误都会打印清晰信息并以非零码退出。
 */
function main() {
  const runtimeDir = resolveRuntimeDir(process.argv.slice(2));

  try {
    // 确保运行目录存在（幂等，已存在则忽略）
    fs.mkdirSync(runtimeDir, { recursive: true });

    for (const file of FILES_TO_COPY) {
      copyRuntimeFile(file, runtimeDir);
    }
  } catch (err) {
    console.error(`\n[setup] 安装失败: ${err.message}`);
    process.exit(1);
  }

  // ---- 安装成功，打印结果 ----
  console.log('\n========================================');
  console.log('  副屏状态灯 安装完成');
  console.log('========================================');
  console.log(`  运行目录: ${runtimeDir}`);
  console.log(`  启动命令: node ${path.join(runtimeDir, 'server.js')}`);

  const lanIps = getLanIpList();
  if (lanIps.length > 0) {
    console.log('  手机浏览器打开（同一局域网下）:');
    for (const ip of lanIps) {
      console.log(`          http://${ip}:${SERVER_PORT}`);
    }
  } else {
    console.log('  手机浏览器打开: 请使用启动服务后控制台打印的手机地址');
  }
  console.log('========================================\n');
}

main();
