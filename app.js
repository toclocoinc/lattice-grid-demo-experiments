// Wiring only. The run log comes from data/runs.json, made by tools/sweep.py.
// The grid lists the runs; the chart is bound to it and draws the validation-loss curve of each selected run.
const { createGrid, createChart } = LatticeGrid;
const el = (id) => document.getElementById(id);
const dark = document.documentElement.dataset.theme === 'dark';
el('version').textContent = LatticeGrid.getVersion ? LatticeGrid.getVersion() : '';

const log = await (await fetch('data/runs.json?v=20261003p')).json();
const rows = log.runs;
const best = rows.reduce((a, b) => (b.val_loss < a.val_loss ? b : a));

// Low loss is good (green), high is bad (red); the other way round for accuracy. Bounds are the 5th-95th percentile.
const good = dark ? '#2f9e6b' : '#5fb98a', mid = dark ? '#2a2f33' : '#f6f6f6', bad = dark ? '#c4513f' : '#e0715c';
const lossScale = { from: 'quantile', colours: [good, mid, bad] };
const accScale = { from: 'quantile', colours: [bad, mid, good] };

const spark = { render: 'line', props: { series: 'curve', min: 'curve_min', max: 'curve_max', label: false } }; // min/max name row fields: each row on its own scale
const columns = [
  { field: 'run', title: 'run', layout: { width: 96 } },
  { field: 'optimiser', title: 'optimiser', group: { enabled: true, index: 0 }, layout: { width: 40 } },
  { field: 'lr', type: 'number', title: 'lr', layout: { width: 60 } },
  { field: 'batch_size', type: 'number', title: 'batch', layout: { width: 60 } },
  { field: 'val_loss', type: 'number', title: 'val loss', format: { decimals: 4 }, layout: { width: 80 } },
  { field: 'val_acc', type: 'number', title: 'val acc', format: { decimals: 3 }, layout: { width: 72 } },
  { field: 'train_loss', type: 'number', title: 'train loss', format: { decimals: 4 }, layout: { width: 80 } },
  { field: 'best_epoch', type: 'number', title: 'best ep.', layout: { width: 70 } },
  { id: 'trend', field: 'curve', title: 'val loss curve', cell: spark, layout: { width: 110 } },
  { field: 'curve_min', type: 'number', layout: { hidden: true } },
  { field: 'curve_max', type: 'number', layout: { hidden: true } },
];

const grid = createGrid(el('grid'), {
  rowKey: 'run', rows, columns, source: { mode: 'memory' },
  selection: { mode: 'multiple', checkbox: true },
  pinnedTopRows: [{ ...best, run: `best: ${best.run}` }],
  formatting: { val_loss: [{ scale: lossScale }], train_loss: [{ scale: lossScale }], val_acc: [{ scale: accScale }] },
});
grid.sort.set([{ col: 'val_loss', dir: 'asc' }]);

// The chart draws a grid's rows, so the curves live in a second, never-shown grid in long form
// (run, epoch, loss; 48 runs x 30 epochs). Filtering it to the ticked runs is what the overlay follows.
const points = rows.flatMap((r) => r.curve.map((loss, i) => ({ id: `${r.run}/${i + 1}`, run: r.run, epoch: i + 1, loss })));
const curves = createGrid(el('curves'), {
  rowKey: 'id', rows: points, source: { mode: 'memory' },
  columns: [{ field: 'id' }, { field: 'run' }, { field: 'epoch', type: 'number' }, { field: 'loss', type: 'number' }],
});
const chart = createChart({
  grid: curves, container: el('chart'), type: 'line', x: 'epoch', y: 'loss', series: 'run',
  legend: { position: 'bottom' }, title: 'Validation loss', scheme: dark ? 'dark' : undefined,
});

/** Redraw the overlay and say how many runs it shows. */
function showSelection() {
  curves.filters.set({ col: 'run', op: 'in', value: grid.selection.keys() });
  el('summary').textContent = `${rows.length} runs; best ${best.run} (${best.optimiser}, lr ${best.lr}, batch ${best.batch_size}) `
    + `val loss ${best.val_loss}. ${grid.selection.rows().length} selected.`;
}
grid.on('selection:changed', showSelection);
grid.selection.set(rows.filter((x) => x.optimiser === 'adam' && x.batch_size === 64).map((x) => x.run)); // a starting overlay
showSelection();
window.__demo = { grid, curves, chart, rows };
