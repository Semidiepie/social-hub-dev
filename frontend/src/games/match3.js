// Pure match-3 engine for PostMePlex Match. No React, no DOM — just board logic.
// A cell is null (empty) or { t: <colorIndex>, s: <special|null>, id: <uid> }.
// specials: "row" (clears its row), "col" (clears its column), "bomb" (color bomb).

let _uid = 1;
const nextId = () => _uid++;

export function makeCell(t, s = null) {
  return { t, s, id: nextId() };
}

function randType(colors) {
  return Math.floor(Math.random() * colors);
}

// Build a starting board with no pre-existing matches and at least one move.
export function createBoard(rows, cols, colors) {
  let grid;
  do {
    grid = [];
    for (let r = 0; r < rows; r++) {
      const row = [];
      for (let c = 0; c < cols; c++) {
        let t;
        do {
          t = randType(colors);
        } while (
          (c >= 2 && row[c - 1].t === t && row[c - 2].t === t) ||
          (r >= 2 && grid[r - 1][c].t === t && grid[r - 2][c].t === t)
        );
        row.push(makeCell(t));
      }
      grid.push(row);
    }
  } while (findMatches(grid).size > 0 || !hasMove(grid, colors));
  return grid;
}

export function clone(grid) {
  return grid.map((row) => row.map((c) => (c ? { ...c } : null)));
}

// Returns a Set of "r,c" keys that are part of any horizontal/vertical run >= 3.
export function findMatches(grid) {
  const rows = grid.length;
  const cols = grid[0].length;
  const out = new Set();
  // horizontal
  for (let r = 0; r < rows; r++) {
    let run = 1;
    for (let c = 1; c <= cols; c++) {
      const same =
        c < cols && grid[r][c] && grid[r][c - 1] && grid[r][c].t === grid[r][c - 1].t;
      if (same) {
        run++;
      } else {
        if (run >= 3) for (let k = c - run; k < c; k++) out.add(`${r},${k}`);
        run = 1;
      }
    }
  }
  // vertical
  for (let c = 0; c < cols; c++) {
    let run = 1;
    for (let r = 1; r <= rows; r++) {
      const same =
        r < rows && grid[r][c] && grid[r - 1][c] && grid[r][c].t === grid[r - 1][c].t;
      if (same) {
        run++;
      } else {
        if (run >= 3) for (let k = r - run; k < r; k++) out.add(`${k},${c}`);
        run = 1;
      }
    }
  }
  return out;
}

// Longest run length + orientation through a specific cell (used to mint a special).
function runThrough(grid, r, c) {
  const rows = grid.length;
  const cols = grid[0].length;
  const t = grid[r][c].t;
  let h = 1;
  for (let k = c - 1; k >= 0 && grid[r][k] && grid[r][k].t === t; k--) h++;
  for (let k = c + 1; k < cols && grid[r][k] && grid[r][k].t === t; k++) h++;
  let v = 1;
  for (let k = r - 1; k >= 0 && grid[k][c] && grid[k][c].t === t; k--) v++;
  for (let k = r + 1; k < rows && grid[k][c] && grid[k][c].t === t; k++) v++;
  const len = Math.max(h, v);
  return { len, horizontal: h >= v };
}

// Apply gravity + refill empties from the top. Mutates and returns the grid.
export function collapse(grid, colors) {
  const rows = grid.length;
  const cols = grid[0].length;
  for (let c = 0; c < cols; c++) {
    let write = rows - 1;
    for (let r = rows - 1; r >= 0; r--) {
      if (grid[r][c]) {
        if (write !== r) {
          grid[write][c] = grid[r][c];
          grid[r][c] = null;
        }
        write--;
      }
    }
    for (let r = write; r >= 0; r--) grid[r][c] = makeCell(randType(colors));
  }
  return grid;
}

// Expand a set of cleared keys to include the full effect of any special tiles
// inside it (row/col line clears, color bombs). Iterates until stable so
// specials detonate specials.
function detonate(grid, keys) {
  const rows = grid.length;
  const cols = grid[0].length;
  const cleared = new Set(keys);
  const queue = [...keys];
  while (queue.length) {
    const k = queue.pop();
    const [r, c] = k.split(",").map(Number);
    const cell = grid[r][c];
    if (!cell || !cell.s) continue;
    const add = (rr, cc) => {
      const kk = `${rr},${cc}`;
      if (grid[rr][cc] && !cleared.has(kk)) {
        cleared.add(kk);
        queue.push(kk);
      }
    };
    if (cell.s === "row") {
      for (let cc = 0; cc < cols; cc++) add(r, cc);
    } else if (cell.s === "col") {
      for (let rr = 0; rr < rows; rr++) add(rr, c);
    } else if (cell.s === "bomb") {
      const target = cell.bombColor != null ? cell.bombColor : cell.t;
      for (let rr = 0; rr < rows; rr++)
        for (let cc = 0; cc < cols; cc++)
          if (grid[rr][cc] && grid[rr][cc].t === target) add(rr, cc);
    }
  }
  return cleared;
}

// Is there any legal swap that creates a match? (used to avoid dead boards)
export function hasMove(grid, colors) {
  const rows = grid.length;
  const cols = grid[0].length;
  const test = (r1, c1, r2, c2) => {
    const g = grid;
    const tmp = g[r1][c1];
    g[r1][c1] = g[r2][c2];
    g[r2][c2] = tmp;
    const ok = findMatches(g).size > 0;
    const tmp2 = g[r1][c1];
    g[r1][c1] = g[r2][c2];
    g[r2][c2] = tmp2;
    return ok;
  };
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      if (c + 1 < cols && test(r, c, r, c + 1)) return true;
      if (r + 1 < rows && test(r, c, r + 1, c)) return true;
    }
  // also playable if a bomb exists
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) if (grid[r][c] && grid[r][c].s === "bomb") return true;
  return false;
}

export function areAdjacent(a, b) {
  return Math.abs(a.r - b.r) + Math.abs(a.c - b.c) === 1;
}

// Attempt a swap. Returns null for an illegal move, otherwise an object with the
// list of resolution "steps" the UI animates in sequence, plus final grid + score.
// Each step: { grid, cleared: [keys], gained } (grid is the board AFTER clearing
// + collapse for that cascade iteration).
export function trySwap(grid, colors, a, b, SCORE_PER = 60) {
  const g = clone(grid);
  const A = g[a.r][a.c];
  const B = g[b.r][b.c];
  if (!A || !B) return null;

  // swap
  g[a.r][a.c] = B;
  g[b.r][b.c] = A;

  const steps = [];
  let total = 0;
  let initialCleared = null;

  const bombA = A.s === "bomb";
  const bombB = B.s === "bomb";

  if (bombA || bombB) {
    // Color-bomb swap: clear every tile of the partner tile's color.
    const bombPos = bombA ? b : a; // bomb now sits where partner was moved... track positions
    // After swap: A is at b, B is at a.
    const keys = new Set();
    if (bombA && bombB) {
      // clear whole board
      for (let r = 0; r < g.length; r++)
        for (let c = 0; c < g[0].length; c++) keys.add(`${r},${c}`);
    } else {
      const bombCell = bombA ? A : B;
      const partnerColor = (bombA ? B : A).t;
      bombCell.bombColor = partnerColor;
      // bomb's current position
      const bp = bombA ? { r: b.r, c: b.c } : { r: a.r, c: a.c };
      keys.add(`${bp.r},${bp.c}`);
    }
    initialCleared = detonate(g, keys);
  } else {
    const matches = findMatches(g);
    if (matches.size === 0) return null; // illegal — no match formed

    // Mint a special at a swapped endpoint if its run is long enough.
    const mint = (pos) => {
      if (!matches.has(`${pos.r},${pos.c}`)) return false;
      const info = runThrough(g, pos.r, pos.c);
      if (info.len >= 5) {
        g[pos.r][pos.c] = { ...g[pos.r][pos.c], s: "bomb" };
        return true;
      }
      if (info.len === 4) {
        g[pos.r][pos.c] = { ...g[pos.r][pos.c], s: info.horizontal ? "row" : "col" };
        return true;
      }
      return false;
    };
    // endpoints after swap: A at b, B at a
    const keepA = mint({ r: b.r, c: b.c });
    const keepB = mint({ r: a.r, c: a.c });

    initialCleared = detonate(g, matches);
    if (keepA) initialCleared.delete(`${b.r},${b.c}`);
    if (keepB) initialCleared.delete(`${a.r},${a.c}`);
  }

  // Resolve first clear + subsequent cascades.
  let clearedKeys = initialCleared;
  while (clearedKeys && clearedKeys.size > 0) {
    const gained = clearedKeys.size * SCORE_PER;
    total += gained;
    for (const k of clearedKeys) {
      const [r, c] = k.split(",").map(Number);
      g[r][c] = null;
    }
    collapse(g, colors);
    steps.push({ grid: clone(g), cleared: [...clearedKeys], gained });
    const next = findMatches(g);
    clearedKeys = next.size ? detonate(g, next) : null;
  }

  if (steps.length === 0) return null;
  return { steps, score: total, grid: g };
}

// Reshuffle a board that has no legal moves (keeps playing without a dead end).
export function reshuffle(grid, colors) {
  const flat = [];
  grid.forEach((row) => row.forEach((c) => c && flat.push(c)));
  let g;
  do {
    for (let i = flat.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [flat[i], flat[j]] = [flat[j], flat[i]];
    }
    let i = 0;
    g = grid.map((row) => row.map(() => flat[i++]));
  } while (findMatches(g).size > 0 || !hasMove(g, colors));
  return g;
}
