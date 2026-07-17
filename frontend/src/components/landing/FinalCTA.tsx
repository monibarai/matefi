'use client';

import Link from 'next/link';
import GlitchText from './GlitchText';

export default function FinalCTA() {
  return (
    <section className="flex flex-col items-center w-full bg-ink py-16 px-6 md:p-[120px] gap-10 md:gap-[48px] border-t-2 border-t-lock">
      <div className="flex items-center justify-center gap-[8px] h-[32px] px-[16px] bg-panel border-2 border-lock">
        <span className="font-mono text-[11px] font-bold text-lock tracking-[2px]">
          <GlitchText text="[YOUR MOVE.]" speed={30} />
        </span>
      </div>

      <h2 className="font-display text-[44px] md:text-[80px] font-bold text-bone tracking-[-2px] leading-none text-center w-full max-w-[1000px] whitespace-pre-line">
        <GlitchText text={'STOP WATCHING.\nSTART STAKING.'} speed={40} delay={200} />
      </h2>

      <p className="font-mono text-[10px] md:text-[14px] text-bone-dim tracking-[0.5px] md:tracking-[2px] text-center text-pretty w-full max-w-[700px] px-2">
        <GlitchText text="CONNECT FREIGHTER, FUND TESTNET USDC, AND PLAY YOUR FIRST TRUSTLESS MATCH." speed={20} delay={450} />
      </p>

      <div className="flex flex-col sm:flex-row items-center gap-4 md:gap-[16px] w-full sm:w-auto">
        <Link
          href="/lobby"
          className="flex items-center justify-center w-full sm:w-[260px] h-[64px] bg-lock hover:bg-[#e6c200] transition-colors"
        >
          <span className="font-display text-[13px] font-bold text-ink-deep tracking-[2px]">
            ENTER THE LOBBY
          </span>
        </Link>
        <Link
          href="/create"
          className="flex items-center justify-center w-full sm:w-[220px] h-[64px] bg-ink border-2 border-edge-bright hover:border-bone-dim transition-colors"
        >
          <span className="font-mono text-[12px] text-bone-dim tracking-[2px]">
            CREATE A MATCH
          </span>
        </Link>
      </div>
    </section>
  );
}
