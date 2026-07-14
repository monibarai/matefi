// scripts/smoke.ts — end-to-end smoke test against a RUNNING relayer.
//
// Flow: health check → create dev match via REST → open a websocket on the
// match room → play scholar's mate via POST /move → assert MOVE, EVAL and
// GAME_OVER events arrive → assert rows exist in moves/evaluations tables.
//
// Start the relayer first (npm run dev), then: npm run smoke
import WebSocket from 'ws';
import { Pool } from 'pg';

const API = process.env.SMOKE_API ?? 'http://localhost:3000/api';
const WS_URL = process.env.SMOKE_WS ?? 'ws://localhost:3001';
const DB_URL = process.env.DATABASE_URL ?? 'postgresql://matefi:matefi@localhost:5432/matefi';

const PLAYER_A = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF'; // white
const PLAYER_B = 'GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBC7S'; // black

// Scholar's mate: 1.e4 e5 2.Bc4 Nc6 3.Qh5 Nf6 4.Qxf7#
const MOVES: Array<[string, string]> = [
  [PLAYER_A, 'e2e4'],
  [PLAYER_B, 'e7e5'],
  [PLAYER_A, 'f1c4'],
  [PLAYER_B, 'b8c6'],
  [PLAYER_A, 'd1h5'],
  [PLAYER_B, 'g8f6'],
  [PLAYER_A, 'h5f7'],
];

function fail(msg: string): never {
  console.error(`\nSMOKE FAILED: ${msg}`);
  process.exit(1);
}

async function post(path: string, body: object): Promise<any> {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) fail(`POST ${path} → ${res.status}: ${JSON.stringify(json)}`);
  return json;
}

async function main(): Promise<void> {
  // 1. health
  const health = await (await fetch(`${API}/health`)).json();
  console.log('health:', health);
  if (!health.db) fail('relayer reports DB down');

  // 2. create dev match
  const { matchId } = await post('/matches/new/init', {
    playerA: PLAYER_A,
    playerB: PLAYER_B,
    betAmount: '100000000', // 10 USDC = 1e8 stroops (1 USDC = 1e7)
    timeControlSecs: 600,
  });
  console.log('created dev match:', matchId);

  // 3. open websocket on the match room
  const events: any[] = [];
  const eventTypes = new Set<string>();
  const ws = new WebSocket(`${WS_URL}?matchId=${matchId}`);
  ws.on('message', (data) => {
    const ev = JSON.parse(data.toString());
    events.push(ev);
    eventTypes.add(ev.type);
    console.log(
      `  ws ← ${ev.type}` +
        (ev.type === 'MOVE' ? ` ${ev.move} (#${ev.moveNumber})` : '') +
        (ev.type === 'EVAL' ? ` score=${ev.score} depth=${ev.depth} mate=${ev.mate}` : '') +
        (ev.type === 'GAME_OVER' ? ` winner=${ev.winner} reason=${ev.reason}` : '')
    );
  });
  await new Promise<void>((resolve, reject) => {
    ws.on('open', () => resolve());
    ws.on('error', reject);
  });

  // 4. play scholar's mate
  let gameOver = false;
  for (const [player, move] of MOVES) {
    const res = await post(`/matches/${matchId}/move`, { playerAddress: player, move });
    console.log(`move ${move} →`, res);
    gameOver = res.gameOver;
  }
  if (!gameOver) fail('final move (Qxf7#) did not end the game');

  // 5. wait for the async EVAL pipeline (engine evals lag the moves)
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    if (eventTypes.has('MOVE') && eventTypes.has('EVAL') && eventTypes.has('GAME_OVER')) break;
    await new Promise((r) => setTimeout(r, 1000));
  }
  ws.close();

  for (const required of ['MOVE', 'EVAL', 'GAME_OVER']) {
    if (!eventTypes.has(required)) fail(`websocket never delivered a ${required} event`);
  }
  const moveEvents = events.filter((e) => e.type === 'MOVE').length;
  const evalEvents = events.filter((e) => e.type === 'EVAL').length;
  const gameOverEv = events.find((e) => e.type === 'GAME_OVER');
  if (moveEvents !== MOVES.length) fail(`expected ${MOVES.length} MOVE events, saw ${moveEvents}`);
  if (gameOverEv.winner !== 'PlayerA') fail(`expected winner PlayerA, got ${gameOverEv.winner}`);

  // 6. verify DB rows
  const db = new Pool({ connectionString: DB_URL });
  const movesRows = await db.query('SELECT COUNT(*)::int AS n FROM moves WHERE match_id = $1', [matchId]);
  const evalRows = await db.query('SELECT COUNT(*)::int AS n FROM evaluations WHERE match_id = $1', [matchId]);
  const game = await db.query('SELECT status, winner, current_fen FROM games WHERE match_id = $1', [matchId]);
  await db.end();

  console.log(`db: moves=${movesRows.rows[0].n} evaluations=${evalRows.rows[0].n} game=`, game.rows[0]);
  if (movesRows.rows[0].n !== MOVES.length) fail(`expected ${MOVES.length} move rows`);
  if (evalRows.rows[0].n < 1) fail('expected at least one evaluation row');
  if (game.rows[0].status !== 'completed' || game.rows[0].winner !== 'PlayerA') {
    fail(`game row not completed/PlayerA: ${JSON.stringify(game.rows[0])}`);
  }

  console.log(`\nSMOKE PASSED — ${moveEvents} MOVE, ${evalEvents} EVAL, 1 GAME_OVER; DB rows verified.`);
  process.exit(0);
}

main().catch((e) => fail(e?.stack ?? String(e)));
