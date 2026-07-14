const path = require('path');
const INIT = require('stockfish/src/stockfish-nnue-16-single.js');
const wasmPath = path.join(__dirname, 'node_modules/stockfish/src/stockfish-nnue-16-single.wasm');
INIT()({ locateFile: (f) => f.endsWith('.wasm') ? wasmPath : f }).then((sf) => {
  let done = false;
  sf.addMessageListener((line) => {
    console.log('SF>', line);
    if (line.startsWith('bestmove') && !done) { done = true; process.exit(0); }
  });
  sf.onCustomMessage('uci');
  sf.onCustomMessage('isready');
  sf.onCustomMessage('position startpos');
  sf.onCustomMessage('go depth 12');
});
setTimeout(() => { console.error('TIMEOUT'); process.exit(1); }, 90000);
