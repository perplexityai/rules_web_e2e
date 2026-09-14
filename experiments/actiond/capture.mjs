// Prototype: all HTTP traffic, browser work and screenshot outputs stay in one action.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import net from 'node:net';
import { chromium } from './playwright-core/index.mjs';

assert.equal(process.platform, 'linux');
assert.equal(process.arch, 'x64');
assert.equal(fs.existsSync('/dev/shm'), false);
assert.equal(fs.existsSync('/var/run/docker.sock'), false);
const output = path.resolve(process.env.OUTPUT_DIR || '/workspace/outputs');
fs.mkdirSync(output, { recursive: true });
const html = `<!doctype html><meta charset="utf-8"><style>
@font-face { font-family: Fixture; src: url('/font.ttf'); }
body { margin: 0; font-family: Fixture; background: #f5f5f5; }
main { margin: 24px; padding: 24px; background: white; border: 1px solid #ccc; }
h1 { font-size: 28px; color: #123; } button { font: inherit; background: #2463eb; color: white; padding: 12px; }
</style><main><h1>Declared Linux browser</h1><p>Same-action HTTP fixture · 12345</p><button>Save translation</button></main>`;
const font = fs.readFileSync('/workspace/runtime/fonts/truetype/freefont/FreeSans.ttf');
const server = http.createServer((req, res) => {
  res.setHeader('Content-Type', req.url === '/font.ttf' ? 'font/ttf' : 'text/html');
  res.end(req.url === '/font.ttf' ? font : html);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({ executablePath: '/workspace/runtime/chromium/chrome-headless-shell', chromiumSandbox: process.argv.includes('--sandbox'), headless: true, timeout: 15000, args: (process.argv.includes('--zygote') || process.argv.includes('--sandbox')) ? [] : ['--no-zygote'] });
  const page = await browser.newPage({ viewport: { width: 640, height: 360 }, deviceScaleFactor: 1, locale: 'en-US', timezoneId: 'UTC', reducedMotion: 'reduce' });
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.evaluate(() => document.fonts.ready);
  assert.equal(await page.evaluate(() => document.fonts.check('28px Fixture')), true);
  assert.equal(await page.locator('h1').textContent(), 'Declared Linux browser');
  const first = await page.screenshot({ path: path.join(output, 'first.png'), animations: 'disabled' });
  const second = await page.screenshot({ path: path.join(output, 'second.png'), animations: 'disabled' });
  assert.deepEqual(first, second);
  await assert.rejects(new Promise((resolve, reject) => {
    const socket = net.connect({ host: '1.1.1.1', port: 443 });
    socket.setTimeout(1000, () => { socket.destroy(); reject(new Error('timeout')); });
    socket.once('error', reject);
    socket.once('connect', () => { socket.destroy(); resolve(); });
  }), error => error.code === 'ENETUNREACH');
  console.log(JSON.stringify({ browser: browser.version(), platform: process.platform, arch: process.arch, identical: true, bytes: first.length, sandbox: process.argv.includes('--sandbox') }));
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
