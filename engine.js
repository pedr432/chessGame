// Fallback engine used when the Stockfish API is unavailable (or on level 1).
// Negamax with alpha-beta over chess.js, material + simple piece-square tables.

const VALUE = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };

// Tables from white's point of view, index 0 = a8.
const PST = {
  p: [0,0,0,0,0,0,0,0, 50,50,50,50,50,50,50,50, 10,10,20,30,30,20,10,10, 5,5,10,25,25,10,5,5,
      0,0,0,20,20,0,0,0, 5,-5,-10,0,0,-10,-5,5, 5,10,10,-20,-20,10,10,5, 0,0,0,0,0,0,0,0],
  n: [-50,-40,-30,-30,-30,-30,-40,-50, -40,-20,0,0,0,0,-20,-40, -30,0,10,15,15,10,0,-30, -30,5,15,20,20,15,5,-30,
      -30,0,15,20,20,15,0,-30, -30,5,10,15,15,10,5,-30, -40,-20,0,5,5,0,-20,-40, -50,-40,-30,-30,-30,-30,-40,-50],
  b: [-20,-10,-10,-10,-10,-10,-10,-20, -10,0,0,0,0,0,0,-10, -10,0,5,10,10,5,0,-10, -10,5,5,10,10,5,5,-10,
      -10,0,10,10,10,10,0,-10, -10,10,10,10,10,10,10,-10, -10,5,0,0,0,0,5,-10, -20,-10,-10,-10,-10,-10,-10,-20],
  r: [0,0,0,0,0,0,0,0, 5,10,10,10,10,10,10,5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5,
      -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, 0,0,0,5,5,0,0,0],
  q: [-20,-10,-10,-5,-5,-10,-10,-20, -10,0,0,0,0,0,0,-10, -10,0,5,5,5,5,0,-10, -5,0,5,5,5,5,0,-5,
      0,0,5,5,5,5,0,-5, -10,5,5,5,5,5,0,-10, -10,0,5,0,0,0,0,-10, -20,-10,-10,-5,-5,-10,-10,-20],
  k: [-30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30,
      -20,-30,-30,-40,-40,-30,-30,-20, -10,-20,-20,-20,-20,-20,-20,-10, 20,20,0,0,0,0,20,20, 20,30,10,0,0,10,30,20],
};

function evaluate(game) {
  let score = 0;
  const board = game.board();
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const p = board[r][f];
      if (!p) continue;
      const idx = p.color === "w" ? r * 8 + f : (7 - r) * 8 + f;
      const v = VALUE[p.type] + PST[p.type][idx];
      score += p.color === "w" ? v : -v;
    }
  }
  return game.turn() === "w" ? score : -score;
}

function ordered(moves) {
  return moves.sort((a, b) => (b.captured ? VALUE[b.captured] - VALUE[b.piece] / 10 : 0) - (a.captured ? VALUE[a.captured] - VALUE[a.piece] / 10 : 0));
}

function negamax(game, depth, alpha, beta) {
  if (game.isCheckmate()) return -100000 - depth;
  if (game.isDraw() || game.isStalemate()) return 0;
  if (depth === 0) return evaluate(game);
  let best = -Infinity;
  for (const m of ordered(game.moves({ verbose: true }))) {
    game.move(m);
    const score = -negamax(game, depth - 1, -beta, -alpha);
    game.undo();
    if (score > best) best = score;
    if (score > alpha) alpha = score;
    if (alpha >= beta) break;
  }
  return best;
}

export function localBestMove(game, depth = 3) {
  const moves = ordered(game.moves({ verbose: true }));
  let best = moves[0];
  let bestScore = -Infinity;
  for (const m of moves) {
    game.move(m);
    // tiny jitter so Nimbus doesn't play the exact same game every time
    const score = -negamax(game, depth - 1, -Infinity, Infinity) + Math.random() * 12;
    game.undo();
    if (score > bestScore) { bestScore = score; best = m; }
  }
  return best.san;
}
