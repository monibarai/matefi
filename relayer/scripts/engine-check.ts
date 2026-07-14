// scripts/engine-check.ts — verifies the Stockfish wrapper with real positions.
// Usage: npm run engine-check
import { engine } from '../src/chess/engine';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
// White is a queen up — should evaluate strongly positive (well over +250 cp).
const WINNING_FEN = 'rnb1kbnr/pppp1ppp/8/4p3/6PQ/8/PPPPPP1P/RNB1KBNR w KQkq - 0 4';
// Back-rank mate in 1 for white (Ra8#) — must report mate → ±9999.
const MATE_FEN = '6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1';

async function main(): Promise<void> {
  const depth = Number(process.env.CHECK_DEPTH ?? 14);
  await engine.init();
  console.log(`backend: ${engine.backendName} (depth ${depth})`);

  const start = await engine.evaluate(START_FEN, depth);
  console.log('start position:', start);
  if (Math.abs(start.score) > 100) throw new Error('start position eval looks wrong (|cp| > 100)');

  const winning = await engine.evaluate(WINNING_FEN, depth);
  console.log('queen-up position:', winning);
  if (winning.score < 250) throw new Error('winning position should evaluate >= +250 cp');

  const mate = await engine.evaluate(MATE_FEN, depth);
  console.log('mate-in-1 position:', mate);
  if (mate.score !== 9999 || mate.mate === null) throw new Error('mate position should map to +9999');

  console.log('\nengine-check PASSED');
  engine.quit();
  process.exit(0);
}

main().catch((e) => {
  console.error('engine-check FAILED:', e);
  process.exit(1);
});
