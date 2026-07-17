import SectionHeader from './SectionHeader';

export default function Bento() {
  return (
    <section className="flex flex-col w-full bg-ink-raise py-16 px-6 md:py-[100px] md:px-[120px] gap-10 md:gap-[48px]">
      <SectionHeader
        label="[05] // CAPABILITIES"
        title={'FIVE CONTRACTS.\nONE MATCH FLOW.'}
        titleWidth="w-full max-w-[800px]"
      />

      <div className="flex flex-col w-full gap-[2px]">
        {/* Row 1 */}
        <div className="flex flex-col md:flex-row w-full gap-[2px]">
          <div className="flex flex-col gap-5 p-8 md:p-[40px] md:h-[320px] bg-lock w-full md:flex-1">
            <span className="font-mono text-[11px] font-bold text-[#1A1A1A] tracking-[2px]">[01]</span>
            <h3 className="font-display text-[24px] md:text-[28px] font-bold text-ink-deep tracking-[-1px] leading-[1.1] whitespace-pre-line">
              {'MATCH\nREGISTRY'}
            </h3>
            <p className="font-mono text-[12px] text-[#1A1A1A] tracking-[1px] leading-[1.6]">
              CREATES AND TRACKS EVERY MATCH. HOLDS PLAYER COLOR ASSIGNMENT AND CURRENT FEN STATE.
            </p>
            <div className="flex items-center justify-center h-[28px] px-[12px] bg-[#0A0A0A] w-fit">
              <span className="font-mono text-[10px] font-bold text-lock tracking-[2px]">[LIVE]</span>
            </div>
          </div>

          <div className="flex flex-col gap-5 p-8 md:p-[40px] md:h-[320px] bg-panel border border-edge w-full md:flex-1">
            <span className="font-mono text-[11px] font-bold text-lock tracking-[2px]">[02]</span>
            <h3 className="font-display text-[24px] md:text-[28px] font-bold text-bone tracking-[-1px] leading-[1.1] whitespace-pre-line">
              {'ESCROW\nVAULT'}
            </h3>
            <p className="font-mono text-[12px] text-bone-dim tracking-[1px] leading-[1.6]">
              LOCKS BOTH PLAYERS&apos; USDC STAKES. RELEASES ONLY ON A VALID SETTLEMENT EVENT.
            </p>
          </div>

          <div className="flex flex-col gap-5 p-8 md:p-[40px] md:h-[320px] bg-ink border border-edge w-full md:flex-1">
            <span className="font-mono text-[11px] font-bold text-lock tracking-[2px]">[03]</span>
            <h3 className="font-display text-[24px] md:text-[28px] font-bold text-bone tracking-[-1px] leading-[1.1] whitespace-pre-line">
              {'PREDICTION\nPOOL'}
            </h3>
            <p className="font-mono text-[12px] text-bone-dim tracking-[1px] leading-[1.6]">
              PARIMUTUEL MARKET ON MATCH OUTCOME. ODDS DERIVE FROM LIVE POOL TOTALS, NO ORACLE PRICE FEED NEEDED.
            </p>
            <div className="flex items-center justify-center h-[28px] px-[12px] bg-panel border border-short w-fit">
              <span className="font-mono text-[10px] font-bold text-short tracking-[2px]">[OPEN]</span>
            </div>
          </div>
        </div>

        {/* Row 2 */}
        <div className="flex flex-col md:flex-row w-full gap-[2px]">
          <div className="flex flex-col gap-5 p-8 md:p-[40px] md:h-[260px] bg-panel border border-edge w-full md:flex-1">
            <span className="font-mono text-[11px] font-bold text-lock tracking-[2px]">[04]</span>
            <h3 className="font-display text-[24px] md:text-[28px] font-bold text-bone tracking-[-1px] leading-[1.1] whitespace-pre-line">
              {'ORACLE\nGATEWAY'}
            </h3>
            <p className="font-mono text-[12px] text-bone-dim tracking-[1px] leading-[1.6]">
              STORES A STOCKFISH EVAL FOR EVERY PLY. FEEDS THE LIVE EVAL BAR AND MARKET AUTO-LOCK LOGIC.
            </p>
          </div>

          <div className="flex flex-col gap-5 p-8 md:p-[40px] md:h-[260px] bg-ink border-2 border-short w-full md:flex-1">
            <span className="font-mono text-[11px] font-bold text-short tracking-[2px]">[05]</span>
            <h3 className="font-display text-[24px] md:text-[28px] font-bold text-bone tracking-[-1px] leading-[1.1] whitespace-pre-line">
              {'SETTLEMENT +\nDISPUTES'}
            </h3>
            <p className="font-mono text-[12px] text-bone-dim tracking-[1px] leading-[1.6]">
              SUBMIT / FINALIZE / DISPUTE / RESOLVE STATE MACHINE. AN ARBITER RESOLVES CONTESTED RESULTS.
            </p>
            <div className="flex items-center justify-center h-[28px] px-[12px] bg-panel border border-short w-fit">
              <span className="font-mono text-[10px] font-bold text-short tracking-[2px]">[GUARDED]</span>
            </div>
          </div>

          <div className="flex flex-col gap-5 p-8 md:p-[40px] md:h-[260px] bg-ink border border-edge w-full md:flex-1">
            <span className="font-mono text-[11px] font-bold text-lock tracking-[2px]">[06]</span>
            <h3 className="font-display text-[24px] md:text-[28px] font-bold text-bone tracking-[-1px] leading-[1.1] whitespace-pre-line">
              {'REAL-TIME\nRELAYER'}
            </h3>
            <p className="font-mono text-[12px] text-bone-dim tracking-[1px] leading-[1.6]">
              WEBSOCKET EVENT STREAM KEEPS BOARD, ODDS, AND MOVE HISTORY IN SYNC ACROSS EVERY CLIENT.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
