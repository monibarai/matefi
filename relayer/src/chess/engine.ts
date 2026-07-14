// src/chess/engine.ts — Stockfish UCI wrapper.
//
// CORRECTION vs README pseudocode: the `stockfish` npm package (v16) does NOT
// export `{ Stockfish }`. It is an Emscripten WASM build. On Node the usable
// entry is `stockfish/src/stockfish-nnue-16-single.js` (single-threaded,
// no worker_threads required):
//
//   const init = require('stockfish/src/stockfish-nnue-16-single.js');
//   const sf = await init()({ locateFile: ... });   // resolves the engine module
//   sf.addMessageListener(line => ...)              // engine stdout, line by line
//   sf.onCustomMessage('uci')                       // send a UCI command
//
// On the single-threaded build `postMessage` aliases `postCustomMessage`,
// which is a no-op without PThread — `onCustomMessage` is the real input
// channel (verified by a live probe; see relayer/scripts/sf-probe.cjs).
//
// Fallback chain: WASM engine → system `stockfish` binary (child_process)
// → clearly-marked degraded heuristic evaluator (material count).
//
// The engine is single-threaded, so evaluate() calls are serialized through
// an internal promise queue.

import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import { config } from '../config';

export interface EvalResult {
  score: number;       // centipawns, positive = white better (normalized)
  depth: number;
  mate: number | null; // moves to mate from white's perspective, null if none
}

/** When Stockfish reports a forced mate, treat as ±9999 cp to force market lock. */
const MATE_SCORE = 9999;
const EVAL_TIMEOUT_MS = 120_000;

interface UciBackend {
  name: string;
  send(cmd: string): void;
  onLine(listener: (line: string) => void): void;
  quit(): void;
}

// ---------------------------------------------------------------------------
// Backend 1: stockfish npm package (WASM, single-threaded build)
// ---------------------------------------------------------------------------

async function createWasmBackend(): Promise<UciBackend> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const init: () => (opts: object) => Promise<any> = require('stockfish/src/stockfish-nnue-16-single.js');
  const wasmPath = require.resolve('stockfish/src/stockfish-nnue-16-single.wasm');

  const sf = await init()({
    locateFile: (file: string) => (file.endsWith('.wasm') ? wasmPath : file),
  });

  const listeners: Array<(line: string) => void> = [];
  sf.addMessageListener((line: string) => {
    for (const l of listeners) l(line);
  });

  return {
    name: 'stockfish-16 WASM (npm package, single-threaded)',
    send: (cmd: string) => sf.onCustomMessage(cmd),
    onLine: (listener) => listeners.push(listener),
    quit: () => {
      try {
        sf.onCustomMessage('quit');
      } catch {
        /* engine teardown is best-effort */
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Backend 2: system stockfish binary
// ---------------------------------------------------------------------------

function createBinaryBackend(): UciBackend {
  const proc: ChildProcessWithoutNullStreams = spawn('stockfish', [], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const listeners: Array<(line: string) => void> = [];
  let buffer = '';
  proc.stdout.on('data', (chunk: Buffer) => {
    buffer += chunk.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const trimmed = line.replace(/\r$/, '');
      for (const l of listeners) l(trimmed);
    }
  });
  return {
    name: 'system stockfish binary',
    send: (cmd: string) => proc.stdin.write(cmd + '\n'),
    onLine: (listener) => listeners.push(listener),
    quit: () => {
      try {
        proc.stdin.write('quit\n');
        proc.kill();
      } catch {
        /* best-effort */
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Backend 3: degraded heuristic (material count) — last resort only
// ---------------------------------------------------------------------------

function heuristicEvaluate(fen: string): EvalResult {
  const values: Record<string, number> = { p: 100, n: 300, b: 310, r: 500, q: 900, k: 0 };
  const board = fen.split(' ')[0] ?? '';
  let score = 0;
  for (const ch of board) {
    const v = values[ch.toLowerCase()];
    if (v === undefined) continue;
    score += ch === ch.toUpperCase() ? v : -v;
  }
  return { score, depth: 0, mate: null };
}

// ---------------------------------------------------------------------------
// StockfishEngine — public API
// ---------------------------------------------------------------------------

export class StockfishEngine {
  private backend: UciBackend | null = null;
  private degraded = false;
  private initPromise: Promise<void> | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private currentLineHandler: ((line: string) => void) | null = null;

  /** Initialize the engine (idempotent). Tries WASM → binary → heuristic. */
  init(): Promise<void> {
    if (!this.initPromise) this.initPromise = this.doInit();
    return this.initPromise;
  }

  private async doInit(): Promise<void> {
    try {
      this.backend = await createWasmBackend();
    } catch (e) {
      console.warn('[engine] WASM stockfish failed to initialize:', (e as Error).message);
      try {
        this.backend = createBinaryBackend();
      } catch (e2) {
        console.warn('[engine] system stockfish binary unavailable:', (e2 as Error).message);
      }
    }

    if (!this.backend) {
      this.degraded = true;
      console.error(
        '[engine] *** DEGRADED MODE: no Stockfish available — using material-count heuristic. ' +
          'Evaluations are NOT engine-quality. Install stockfish to fix. ***'
      );
      return;
    }

    // Route every engine line to the active per-evaluation handler.
    this.backend.onLine((line) => {
      if (this.currentLineHandler) this.currentLineHandler(line);
    });

    await this.handshake();
    console.log(`[engine] ready: ${this.backend.name}`);
  }

  private handshake(): Promise<void> {
    const backend = this.backend!;
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('UCI handshake timeout')), 30_000);
      this.currentLineHandler = (line) => {
        if (line === 'readyok') {
          clearTimeout(timer);
          this.currentLineHandler = null;
          resolve();
        }
      };
      backend.send('uci');
      backend.send('setoption name Threads value 1');
      backend.send('isready');
    });
  }

  get isDegraded(): boolean {
    return this.degraded;
  }

  get backendName(): string {
    return this.degraded ? 'degraded heuristic (material count)' : this.backend?.name ?? 'uninitialized';
  }

  /**
   * Evaluate a FEN at the given depth. Calls are serialized — the engine is
   * single-threaded and UCI is stateful.
   * Scores are normalized to WHITE's perspective (UCI reports the score from
   * the side to move). `score mate N` is mapped to ±9999 to force market lock.
   */
  evaluate(fen: string, depth: number = config.STOCKFISH_DEPTH): Promise<EvalResult> {
    const run = this.queue.then(() => this.evaluateExclusive(fen, depth));
    // Keep the chain alive even if an evaluation fails.
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async evaluateExclusive(fen: string, depth: number): Promise<EvalResult> {
    await this.init();

    if (this.degraded || !this.backend) {
      return heuristicEvaluate(fen);
    }
    const backend = this.backend;

    const whiteToMove = fen.split(' ')[1] !== 'b';
    const sign = whiteToMove ? 1 : -1;

    return new Promise<EvalResult>((resolve) => {
      let bestScore = 0;
      let bestDepth = 0;
      let mateIn: number | null = null;
      let settled = false;

      const finish = (result: EvalResult) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.currentLineHandler = null;
        resolve(result);
      };

      const timer = setTimeout(() => {
        console.warn(`[engine] evaluation timeout at depth ${bestDepth} — stopping search`);
        backend.send('stop'); // bestmove will follow, but resolve now with what we have
        finish({ score: bestScore, depth: bestDepth, mate: mateIn });
      }, EVAL_TIMEOUT_MS);

      this.currentLineHandler = (line: string) => {
        if (line.startsWith('info') && line.includes('score')) {
          const depthMatch = line.match(/\bdepth (\d+)/);
          const cpMatch = line.match(/score cp (-?\d+)/);
          const mateMatch = line.match(/score mate (-?\d+)/);

          if (depthMatch) bestDepth = parseInt(depthMatch[1], 10);
          if (cpMatch) {
            bestScore = sign * parseInt(cpMatch[1], 10);
            mateIn = null;
          }
          if (mateMatch) {
            const m = sign * parseInt(mateMatch[1], 10);
            mateIn = m;
            bestScore = m > 0 ? MATE_SCORE : -MATE_SCORE; // force lock per README §11
          }
        }

        if (line.startsWith('bestmove')) {
          finish({ score: bestScore, depth: bestDepth, mate: mateIn });
        }
      };

      backend.send('ucinewgame');
      backend.send(`position fen ${fen}`);
      backend.send(`go depth ${depth}`);
    });
  }

  quit(): void {
    this.backend?.quit();
  }
}

/** Shared singleton — one engine process for the whole relayer. */
export const engine = new StockfishEngine();
