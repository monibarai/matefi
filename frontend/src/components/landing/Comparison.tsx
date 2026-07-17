import SectionHeader from './SectionHeader';

const rows = [
  { feature: 'NON-CUSTODIAL ESCROW', mf: '[✓]', bookmaker: '[✗]', friend: '[—]', chesscom: '[✗]' },
  { feature: 'ON-CHAIN SETTLEMENT', mf: '[✓]', bookmaker: '[✗]', friend: '[✗]', chesscom: '[✗]' },
  { feature: 'LIVE PREDICTION MARKET', mf: '[✓]', bookmaker: '[—]', friend: '[✗]', chesscom: '[✗]' },
  { feature: 'STOCKFISH ANTI-CHEAT', mf: '[✓]', bookmaker: '[✗]', friend: '[✗]', chesscom: '[✓]' },
  { feature: 'DISPUTE ARBITRATION', mf: '[✓]', bookmaker: '[—]', friend: '[✗]', chesscom: '[—]' },
  { feature: 'NO SIGNUP, JUST A WALLET', mf: '[✓]', bookmaker: '[✗]', friend: '[✓]', chesscom: '[✗]' },
];

function cellStyle(val: string) {
  if (val === '[✓]') return 'font-bold text-[14px]';
  if (val === '[✗]') return 'text-[#3D3D3D] text-[13px]';
  if (val === '[—]') return 'text-[#444444] text-[13px]';
  return 'text-[#444444] text-[10px]';
}

export default function Comparison() {
  return (
    <section id="comparison" className="flex flex-col w-full bg-ink-deep py-16 px-6 md:py-[100px] md:px-[120px] gap-12 md:gap-[64px]">
      <SectionHeader
        label="[06] // VS. THE FIELD"
        title={'WHY MATEFI\nBEATS THE ALTERNATIVES.'}
        subtitle="NO SPIN — JUST WHAT'S ENFORCEABLE ON-CHAIN VS. WHAT ISN'T."
      />

      {/* Desktop table */}
      <div className="hidden md:flex flex-col w-full border border-edge">
        <div className="flex w-full h-[56px] bg-panel border-b-2 border-b-lock">
          <div className="flex items-center w-[400px] shrink-0 px-[32px] border-r border-r-edge">
            <span className="font-display text-[11px] font-bold text-bone-dim tracking-[2px]">FEATURE</span>
          </div>
          <div className="flex items-center flex-1 px-[32px] bg-panel-2 border-r border-r-edge">
            <span className="font-display text-[11px] font-bold text-lock tracking-[2px]">MATEFI</span>
          </div>
          {['CUSTODIAL BOOKMAKER', 'SIDE BET W/ A FRIEND', 'CHESS.COM RATED'].map((tool, i) => (
            <div key={tool} className={`flex items-center flex-1 px-[32px] ${i < 2 ? 'border-r border-r-edge' : ''}`}>
              <span className="font-display text-[11px] font-bold text-bone-faint tracking-[2px]">{tool}</span>
            </div>
          ))}
        </div>

        {rows.map((row, i) => (
          <div key={row.feature} className={`flex w-full h-[56px] ${i < rows.length - 1 ? 'border-b border-b-[#1D1D1D]' : ''}`}>
            <div className="flex items-center w-[400px] shrink-0 px-[32px] border-r border-r-edge">
              <span className="font-mono text-[12px] text-[#CCCCCC] tracking-[1px]">{row.feature}</span>
            </div>
            <div className="flex items-center flex-1 px-[32px] bg-[#0D0D0D] border-r border-r-edge">
              <span className="font-mono tracking-[1px] text-lock font-bold text-[14px]">{row.mf}</span>
            </div>
            {[row.bookmaker, row.friend, row.chesscom].map((val, j) => (
              <div key={j} className={`flex items-center flex-1 px-[32px] ${j < 2 ? 'border-r border-r-edge' : ''}`}>
                <span className={`font-mono tracking-[1px] ${cellStyle(val)}`}>{val}</span>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Mobile: card-per-feature layout */}
      <div className="flex flex-col md:hidden w-full gap-[2px]">
        <div className="grid grid-cols-5 bg-panel border border-lock border-b-2">
          <div className="col-span-2 px-3 py-3">
            <span className="font-display text-[9px] font-bold text-bone-dim tracking-[1px]">FEATURE</span>
          </div>
          <div className="px-2 py-3 bg-panel-2">
            <span className="font-display text-[9px] font-bold text-lock tracking-[1px]">MF</span>
          </div>
          <div className="px-2 py-3">
            <span className="font-display text-[9px] font-bold text-bone-faint tracking-[1px]">BKR</span>
          </div>
          <div className="px-2 py-3">
            <span className="font-display text-[9px] font-bold text-bone-faint tracking-[1px]">FRD</span>
          </div>
        </div>
        {rows.map((row, i) => (
          <div key={row.feature} className={`grid grid-cols-5 border border-[#1D1D1D] ${i % 2 === 0 ? 'bg-ink' : 'bg-[#0D0D0D]'}`}>
            <div className="col-span-2 flex items-center px-3 py-4">
              <span className="font-mono text-[9px] text-[#CCCCCC] tracking-[1px] leading-[1.4]">{row.feature}</span>
            </div>
            <div className="flex items-center px-2 py-4 bg-[#0D0D0D]">
              <span className="font-mono text-[12px] text-lock font-bold">{row.mf}</span>
            </div>
            <div className="flex items-center px-2 py-4">
              <span className="font-mono text-[11px]">{row.bookmaker}</span>
            </div>
            <div className="flex items-center px-2 py-4">
              <span className="font-mono text-[11px]">{row.friend}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
