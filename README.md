# Experiment comparison: a hyper-parameter sweep

A [Lattice Grid](https://latticegrid.dev) demo. A small classifier was trained
48 times, once per optimiser, learning rate and batch size, and the run log is
shown as a grid:

- **grouped by optimiser** (sgd, momentum, rmsprop, adam; 12 runs each);
- **the best run pinned** above the groups (a pinned top row: it stays against
  the header and is not part of the sorted data);
- **a sparkline per run on its own scale**: the validation-loss curve, with
  `min`/`max` bound to each row's own range so every curve fills its cell;
- **metric colour scales** on validation loss, train loss and validation
  accuracy (5th to 95th percentile, green good, red bad);
- **an overlay line chart** of the validation-loss curves of the ticked runs:
  tick runs and the chart gains a series each, untick and it loses them.

Light and dark: add `?theme=dark`.

## Run it locally

    python3 -m http.server      # then open http://localhost:8000/

The grid is loaded from the published package
`https://cdn.jsdelivr.net/npm/@toclocoinc/lattice-grid@1.86.4/` (set `LOCAL = true`
in `index.html` to use a build in `vendor/` instead). No licence key, no API
key, no analytics: nothing is sent anywhere. Note that without a key the grid
shows its trial watermark on any host other than localhost.

## Data

[Palmer Penguins](https://github.com/allisonhorst/palmerpenguins)
(`inst/extdata/penguins.csv`), licence **CC0 1.0**; the 344-row file is in
`data/penguins.csv` (333 rows have all four measurements; 256 train, 86
validation after a seeded shuffle).

## What is precomputed, and how to reproduce it

`data/runs.json` (20 KB) is the output of `tools/sweep.py`: softmax regression
(bill length and depth, flipper length, body mass -> species), trained for 30
epochs per configuration with SGD, momentum, RMSprop or Adam
(4 optimisers x 4 learning rates x 3 batch sizes = 48 runs). Pure Python
standard library, fixed seeds, no wall-clock values, so it is reproducible
byte for byte:

    python3 tools/sweep.py            # rewrites data/runs.json (about 7 s)
    python3 tools/sweep.py --check    # recomputes and fails if the file differs

The chart draws a grid's rows, so `app.js` builds a second, never-shown grid
of the curves in long form (run, epoch, loss) and filters it to the ticked
runs; the chart is bound to that.

## Checking it

    node tools/verify.mjs [--shots <dir>]

Opens the page in headless Chrome (needs `puppeteer-core`; set `CHROME` and
`PUPPETEER`), in light and dark: really clicks three run checkboxes and asserts
the chart has three series, and that the console has no errors.

## Licence

Demo code: MIT, see [LICENSE](LICENSE). Lattice Grid itself is loaded from the
CDN under its own licence.

The page carries the Lattice Grid public-demo licence for `toclocoinc.github.io`, so no watermark shows there.
