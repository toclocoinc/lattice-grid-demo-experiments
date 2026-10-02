#!/usr/bin/env python3
"""Reproducible hyper-parameter sweep behind the experiment-comparison demo.

Trains a softmax-regression classifier (4 measurements -> 3 species) on the
Palmer Penguins sample (data/penguins.csv, CC0) once per configuration of
optimiser x learning rate x batch size, and writes the run log to
data/runs.json: one record per run with its validation-loss curve.

Pure Python standard library, fixed seeds, no wall-clock values: the same
command on any machine writes the same file.

    python3 tools/sweep.py            # writes data/runs.json
    python3 tools/sweep.py --check    # recomputes and fails if the file differs
"""
import csv, json, math, random, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SEED = 1628
EPOCHS = 30
OPTIMISERS = ['sgd', 'momentum', 'rmsprop', 'adam']
LEARNING_RATES = [0.003, 0.01, 0.03, 0.1]
BATCH_SIZES = [16, 64, 256]
SPECIES = ['Adelie', 'Chinstrap', 'Gentoo']
FEATURES = ['bill_length_mm', 'bill_depth_mm', 'flipper_length_mm', 'body_mass_g']


def load():
    """Return (train, validation) lists of (features, class index), standardised on the training split."""
    with open(ROOT / 'data' / 'penguins.csv', newline='') as f:
        rows = [r for r in csv.DictReader(f) if all(r[k] not in ('', 'NA') for k in FEATURES)]
    data = [([float(r[k]) for k in FEATURES], SPECIES.index(r['species'])) for r in rows]
    random.Random(SEED).shuffle(data)
    cut = int(len(data) * 0.75)
    train, val = data[:cut], data[cut:]
    mean = [sum(x[i] for x, _ in train) / len(train) for i in range(4)]
    sd = [math.sqrt(sum((x[i] - mean[i]) ** 2 for x, _ in train) / len(train)) for i in range(4)]
    norm = lambda part: [([(x[i] - mean[i]) / sd[i] for i in range(4)] + [1.0], y) for x, y in part]
    return norm(train), norm(val)


def softmax(w, x):
    """Class probabilities for one example under weights w (3 x 5)."""
    z = [sum(wi * xi for wi, xi in zip(row, x)) for row in w]
    m = max(z)
    e = [math.exp(v - m) for v in z]
    s = sum(e)
    return [v / s for v in e]


def evaluate(w, data):
    """Mean cross-entropy and accuracy of weights w over data."""
    loss = acc = 0.0
    for x, y in data:
        p = softmax(w, x)
        loss -= math.log(max(p[y], 1e-12))
        acc += max(range(3), key=p.__getitem__) == y
    return loss / len(data), acc / len(data)


def gradient(w, batch):
    """Mean cross-entropy gradient over a mini-batch."""
    g = [[0.0] * 5 for _ in range(3)]
    for x, y in batch:
        p = softmax(w, x)
        for c in range(3):
            d = p[c] - (1.0 if c == y else 0.0)
            for j in range(5):
                g[c][j] += d * x[j]
    n = len(batch)
    return [[v / n for v in row] for row in g]


def train_run(opt, lr, batch_size, train, val, seed):
    """Train one configuration; return its per-epoch validation loss and final metrics."""
    rng = random.Random(seed)
    w = [[rng.gauss(0, 0.1) for _ in range(5)] for _ in range(3)]
    m = [[0.0] * 5 for _ in range(3)]   # momentum / first moment
    v = [[0.0] * 5 for _ in range(3)]   # second moment
    t = 0
    curve = []
    for _ in range(EPOCHS):
        order = train[:]
        rng.shuffle(order)
        for s in range(0, len(order), batch_size):
            g = gradient(w, order[s:s + batch_size])
            t += 1
            for c in range(3):
                for j in range(5):
                    gi = g[c][j]
                    if opt == 'sgd':
                        step = lr * gi
                    elif opt == 'momentum':
                        m[c][j] = 0.9 * m[c][j] + gi
                        step = lr * m[c][j]
                    elif opt == 'rmsprop':
                        v[c][j] = 0.9 * v[c][j] + 0.1 * gi * gi
                        step = lr * gi / (math.sqrt(v[c][j]) + 1e-8)
                    else:  # adam
                        m[c][j] = 0.9 * m[c][j] + 0.1 * gi
                        v[c][j] = 0.999 * v[c][j] + 0.001 * gi * gi
                        step = lr * (m[c][j] / (1 - 0.9 ** t)) / (math.sqrt(v[c][j] / (1 - 0.999 ** t)) + 1e-8)
                    w[c][j] -= step
        curve.append(evaluate(w, val)[0])
    val_loss, val_acc = evaluate(w, val)
    return curve, val_loss, val_acc, evaluate(w, train)[0]


def sweep():
    """Run every configuration and return the run log."""
    train, val = load()
    runs = []
    for opt in OPTIMISERS:
        for lr in LEARNING_RATES:
            for bs in BATCH_SIZES:
                n = len(runs) + 1
                curve, vl, va, tl = train_run(opt, lr, bs, train, val, SEED * 1000 + n)
                curve = [round(c, 5) for c in curve]
                runs.append({
                    'run': f'run-{n:02d}', 'optimiser': opt, 'lr': lr, 'batch_size': bs,
                    'val_loss': round(vl, 5), 'val_acc': round(va, 5), 'train_loss': round(tl, 5),
                    'best_epoch': curve.index(min(curve)) + 1,
                    'curve': curve, 'curve_min': min(curve), 'curve_max': max(curve),
                })
    return {'dataset': 'Palmer Penguins (CC0)', 'seed': SEED, 'epochs': EPOCHS,
            'train_rows': len(train), 'val_rows': len(val), 'runs': runs}


if __name__ == '__main__':
    out = json.dumps(sweep(), indent=None, separators=(',', ':')) + '\n'
    path = ROOT / 'data' / 'runs.json'
    if '--check' in sys.argv:
        same = path.read_text() == out
        print('runs.json reproduces exactly' if same else 'runs.json DIFFERS')
        sys.exit(0 if same else 1)
    path.write_text(out)
    print(f'wrote {path} ({len(out)} bytes)')
