/**
 * Open the page in real headless Chrome and check each acceptance line.
 *   node tools/verify.mjs [--shots <dir>]
 * Needs Chrome and puppeteer-core; set CHROME and PUPPETEER to point at them.
 */
import { mkdir } from 'node:fs/promises';

const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
const PUPPETEER = process.env.PUPPETEER
  || '/home/latticeprodmgr/.npm/_npx/8003d8991b0d346b/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
const arg = (name) => { const i = process.argv.indexOf(name); return i > -1 ? process.argv[i + 1] : null; };
const shots = arg('--shots');
const { default: puppeteer } = await import(PUPPETEER);
const { startServer } = await import('./serve.mjs');
const { server, port } = await startServer(0);
const failures = [];
const check = (ok, label, detail = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? `: ${detail}` : ''}`); if (!ok) failures.push(label); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
if (shots) await mkdir(shots, { recursive: true });
try {
  for (const theme of ['light', 'dark']) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1400, height: 800 });
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error' || (m.type() === 'warning' && /\[lattice\]/.test(m.text()) && !/no licence key/.test(m.text()))) errors.push(`${m.type()}: ${m.text()}`); });
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    await page.goto(`http://127.0.0.1:${port}/?theme=${theme}&t=${Date.now()}`, { waitUntil: 'networkidle0' });
    await sleep(600);
    const s = await page.evaluate(() => {
      const d = window.__demo;
      return {
        version: LatticeGrid.getVersion(), runs: d.rows.length,
        sparks: document.querySelectorAll('#grid svg, #grid canvas').length,
        pinned: document.querySelector('#grid').textContent.includes('best: '),
        groups: [...new Set(d.rows.map((r) => r.optimiser))].length,
        groupRows: [...document.querySelectorAll('#grid [role="row"]')].filter((r) => /(sgd|momentum|rmsprop|adam)\s*\(12\)/.test(r.textContent)).length,
        watermark: /unlicen|watermark/i.test(document.body.textContent),
        theme: document.documentElement.dataset.theme || 'light',
      };
    });
    check(s.version === '1.86.7', `${theme}: grid is 1.86.7`, s.version);
    check(s.runs === 48, `${theme}: 48 runs`, String(s.runs));
    check(s.pinned, `${theme}: best run pinned row shown`);
    check(s.groupRows >= 2, `${theme}: grouped by optimiser`, `${s.groupRows} group rows in view, each (12) runs`);
    check(s.sparks >= 10, `${theme}: sparklines drawn`, `${s.sparks} svg/canvas in grid`);
    // The overlay follows the selection: clear it, then really click three run checkboxes.
    const overlay = () => page.evaluate(() => ({
      selected: window.__demo.grid.selection.keys(),
      series: window.__demo.chart.data().series.map((x) => x.label),
      paths: document.querySelectorAll('#chart svg path[stroke]:not([stroke="none"])').length,
      legend: [...document.querySelectorAll('#chart svg text, #chart [class*="legend"]')].map((n) => n.textContent.trim()).filter((t) => /^run-\d+$/.test(t)),
    }));
    await page.evaluate(() => window.__demo.grid.selection.set([]));
    await sleep(300);
    const none = await overlay();
    check(none.series.length === 0 || none.series.every((x) => !x), `${theme}: nothing selected -> no series`, JSON.stringify(none.series));
    const targets = await page.evaluate(() => [...document.querySelectorAll('#grid .lat-row[data-region="centre"][data-key^="run-"]')].map((r) => r.dataset.key).slice(0, 3));
    for (const run of targets) {
      const box = await page.$(`#grid .lat-row[data-key="${run}"] input[type="checkbox"]`);
      if (!box) { check(false, `${theme}: checkbox for ${run} found`); continue; }
      await box.click();
      await sleep(250);
    }
    const three = await overlay();
    check(JSON.stringify(three.selected.sort()) === JSON.stringify([...targets].sort()), `${theme}: three real clicks select 3 runs`, three.selected.join(','));
    check(three.series.length === 3 && targets.every((t) => three.series.includes(t)), `${theme}: overlay chart has 3 series`, `${three.series.join(',')}; legend ${three.legend.join(',')}`);
    await page.evaluate(() => window.__demo.grid.selection.set(['run-34']));
    await sleep(250);
    const one = await overlay();
    check(one.series.length === 1, `${theme}: deselecting drops to 1 series`, one.series.join(','));
    await page.evaluate(() => window.__demo.grid.selection.set(['run-34', 'run-01', 'run-20']));
    await sleep(400);
    if (shots) await page.screenshot({ path: `${shots}/${theme}.png` });
    check(errors.length === 0, `${theme}: console clean`, errors.join(' | '));
    await page.close();
  }
} finally {
  await browser.close();
  server.close();
}
process.exit(failures.length ? 1 : 0);
