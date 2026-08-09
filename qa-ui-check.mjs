// qa-ui-check.mjs
// 副屏状态灯 - 轻量静态 UI 校验（无需启动服务，纯文本/正则解析）
// 用法: node qa-ui-check.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, 'index.html'), 'utf8');

let passed = 0;
const failures = [];
function check(name, cond, detail = '') {
  if (cond) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(`${name}${detail ? ' — ' + detail : ''}`);
    console.log(`  FAIL  ${name}${detail ? ' — ' + detail : ''}`);
  }
}

// 提取媒体查询块内容（匹配首个 { 到对应 }）
function extractMediaBlock(text, query) {
  const re = new RegExp('@media\\s*\\(' + query.replace(/[()]/g, '\\$&') + '\\)\\s*\\{');
  const start = text.search(re);
  if (start < 0) return null;
  const open = text.indexOf('{', start);
  let depth = 0;
  for (let j = open; j < text.length; j++) {
    if (text[j] === '{') depth++;
    else if (text[j] === '}') { depth--; if (depth === 0) return text.slice(open + 1, j); }
  }
  return null;
}

const landscape = extractMediaBlock(html, 'orientation: landscape');

console.log('\n[1] 横屏媒体查询');
check('存在 @media (orientation: landscape) 且语法闭合', landscape !== null,
  landscape === null ? '未找到或花括号不配对' : '');

if (landscape !== null) {
  check('横屏下 #lights 改为 flex-direction: row',
    /#lights[\s\S]*?flex-direction:\s*row/.test(landscape));
  check('横屏下 .light 尺寸改用 vh 基准 (width/height)',
    /\.light\s*\{[\s\S]*?width:\s*[\d.]+\s*vh[\s\S]*?height:\s*[\d.]+\s*vh/.test(landscape),
    '应出现 width:/height: 以 vh 结尾');
  check('横屏下 #status 字号改用 vh 基准',
    /#status\s*\{[\s\S]*?font-size:\s*[\d.]+\s*vh/.test(landscape));
  check('横屏下按钮字号改用 vh 基准 (#fullscreen-btn, #mute-btn)',
    /#fullscreen-btn,\s*#mute-btn\s*\{[\s\S]*?font-size:\s*[\d.]+\s*vh/.test(landscape));
  check('横屏下 #controls 容器 bottom 改用 vh 基准',
    /#controls\s*\{[\s\S]*?bottom:\s*[\d.]+\s*vh/.test(landscape));
  check('横屏下 #hint 字号改用 vh 基准',
    /#hint\s*\{[\s\S]*?font-size:\s*[\d.]+\s*vh/.test(landscape));
}

console.log('\n[2] 待机态淡色（基础态，非 media 内）');
// idle 规则位于基础 style，不在横屏块内（用整段校验，但排除被 landscape 包裹的可能）
check('.light.red 基础态有淡色 background (rgba 低 alpha 0.10)',
  /\.light\.red\s*\{[\s\S]*?background:\s*rgba\(255,\s*59,\s*48,\s*0\.10\)/.test(html));
check('.light.red 基础态有淡色 border-color (rgba 0.40)',
  /\.light\.red\s*\{[\s\S]*?border-color:\s*rgba\(255,\s*59,\s*48,\s*0\.40\)/.test(html));
check('.light.yellow 基础态有淡色 background (rgba 0.10)',
  /\.light\.yellow\s*\{[\s\S]*?background:\s*rgba\(255,\s*204,\s*0,\s*0\.10\)/.test(html));
check('.light.yellow 基础态有淡色 border-color (rgba 0.40)',
  /\.light\.yellow\s*\{[\s\S]*?border-color:\s*rgba\(255,\s*204,\s*0,\s*0\.40\)/.test(html));
check('.light.green 基础态有淡色 background (rgba 0.10)',
  /\.light\.green\s*\{[\s\S]*?background:\s*rgba\(52,\s*199,\s*89,\s*0\.10\)/.test(html));
check('.light.green 基础态有淡色 border-color (rgba 0.40)',
  /\.light\.green\s*\{[\s\S]*?border-color:\s*rgba\(52,\s*199,\s*89,\s*0\.40\)/.test(html));

console.log('\n[3] .light 基类与 active 高亮未被破坏');
check('.light 基类保留 transition（含 opacity/box-shadow/background/border-color）',
  /\.light\s*\{[\s\S]*?transition:\s*opacity[\s\S]*?box-shadow[\s\S]*?background[\s\S]*?border-color/.test(html));
check('.light.red.active 实底 + 发光 box-shadow + opacity:1',
  /\.light\.red\.active\s*\{[\s\S]*?background:\s*#ff3b30[\s\S]*?box-shadow:[\s\S]*?opacity:\s*1/.test(html));
check('.light.yellow.active 实底 + 发光 box-shadow + opacity:1',
  /\.light\.yellow\.active\s*\{[\s\S]*?background:\s*#ffcc00[\s\S]*?box-shadow:[\s\S]*?opacity:\s*1/.test(html));
check('.light.green.active 实底 + 发光 box-shadow + opacity:1',
  /\.light\.green\.active\s*\{[\s\S]*?background:\s*#34c759[\s\S]*?box-shadow:[\s\S]*?opacity:\s*1/.test(html));

console.log('\n[4] HTML 结构完整性');
check('以 <!DOCTYPE html> 开头', /^<!DOCTYPE html>/i.test(html.trim()));
check('含 <style> 与 </style> 且闭合', /<style>[\s\S]*<\/style>/.test(html));
check('含 <script> 与 </script> 且闭合', /<script>[\s\S]*<\/script>/.test(html));
check('以 </html> 结尾', /<\/html>\s*$/.test(html));

console.log('\n[5] class 名称与 JS applyState 一致');
check("JS 用 classList.toggle('active', ...) 切换",
  /classList\.toggle\(\s*'active'/.test(html));
check('HTML 含 class="light red"', /class="light red"/.test(html));
check('HTML 含 class="light yellow"', /class="light yellow"/.test(html));
check('HTML 含 class="light green"', /class="light green"/.test(html));

console.log('\n[6] 语音播报（SpeechSynthesis）接入');
check('HTML 含语音开关按钮 <button id="mute-btn">',
  /<button id="mute-btn">/.test(html));
check('JS 含 muted 静音变量声明', /var muted = false/.test(html));
check('JS 含 speechSynthesis 支持判断', /'speechSynthesis' in window/.test(html));
check('JS 含 SpeechSynthesisUtterance 播报', /new SpeechSynthesisUtterance\(/.test(html));
check('JS 含 warmUpSpeech 预热函数', /function warmUpSpeech\(\)/.test(html));
check('JS 含 speakState 播报函数', /function speakState\(/.test(html));
check("初始化 applyState 不语音 (doSpeak=false)",
  /applyState\('idle',\s*false\)/.test(html));
check('首次用户交互预热语音 (once 监听)',
  /addEventListener\('(click|touchstart)',\s*warmUpSpeech,\s*\{\s*once:\s*true\s*\}\)/.test(html));
check("静音按钮点击切换文案",
  /muteBtn\.textContent = muted \? '语音关' : '语音开'/.test(html));

const total = passed + failures.length;
console.log(`\n==== 结果: ${passed}/${total} 通过, ${failures.length} 失败 ====`);
if (failures.length) {
  console.log('未通过项:');
  for (const f of failures) console.log('  - ' + f);
  process.exit(1);
} else {
  console.log('全部静态校验通过 ✅');
}
