'use client';

import { useState } from 'react';
import Link from 'next/link';
import SectionHeader from './SectionHeader';

const faqs = [
  {
    question: 'WHO HOLDS MY USDC WHILE I PLAY?',
    answer:
      "NOBODY. YOUR STAKE LOCKS INTO THE escrow_vault SOROBAN CONTRACT THE MOMENT YOUR MATCH STARTS. NO ADMIN KEY, NO MATEFI TREASURY ACCOUNT, CAN MOVE IT BEFORE SETTLEMENT FIRES.",
    defaultOpen: true,
  },
  { question: 'DO I NEED A CHESS.COM OR LICHESS ACCOUNT?', answer: 'NO ACCOUNT AT ALL. CONNECT A FREIGHTER WALLET, FUND IT WITH TESTNET USDC AND XLM, AND YOU CAN CREATE OR JOIN A MATCH IMMEDIATELY.' },
  { question: 'HOW DOES THE PREDICTION MARKET WORK?', answer: "IT'S PARIMUTUEL — ODDS ARE DERIVED FROM LIVE POOL TOTALS, NOT AN ORACLE PRICE FEED. THE MARKET AUTO-LOCKS WHEN THE ENGINE EVAL CROSSES A DECISIVE THRESHOLD." },
  { question: 'WHAT STOPS SOMEONE FROM USING AN ENGINE TO CHEAT?', answer: "EVERY MOVE IS COMPARED AGAINST A STOCKFISH BESTMOVE FOR THAT POSITION. AN ABNORMALLY HIGH MATCH RATE ACROSS A GAME FLAGS THE MATCH — THAT EVIDENCE FEEDS THE DISPUTE PROCESS, IT DOESN'T AUTO-SETTLE." },
  { question: 'WHAT HAPPENS IF WE DISAGREE ON THE RESULT?', answer: 'EITHER PLAYER CAN OPEN A DISPUTE INSIDE THE FINALIZE WINDOW. AN ON-CHAIN ARBITER REVIEWS THE MOVE HISTORY AND ANTI-CHEAT FLAGS AND RESOLVES THE MATCH.' },
  { question: 'IS THIS REAL MONEY?', answer: 'NOT YET. MATEFI IS LIVE ON STELLAR TESTNET WITH TESTNET USDC — FUND YOUR WALLET VIA FRIENDBOT AND PLAY WITH ZERO REAL-WORLD RISK.' },
];

export default function FAQ() {
  const [openIndex, setOpenIndex] = useState(0);

  return (
    <section id="faq" className="flex flex-col w-full bg-ink-deep py-16 px-6 md:py-[100px] md:px-[120px]">
      <div className="w-full max-w-[480px]">
        <SectionHeader
          label="[08] // FAQ"
          title={'GOT\nQUESTIONS?'}
          subtitle="EVERYTHING YOU NEED TO KNOW BEFORE YOU STAKE YOUR FIRST MATCH."
          titleWidth="w-full"
          subtitleWidth="w-full"
        />
      </div>

      <div className="h-10 md:h-[64px]" />

      <div className="flex flex-col w-full">
        {faqs.map((faq, i) => {
          const isOpen = openIndex === i;
          return (
            <div key={i} className="flex flex-col w-full border-t border-t-[#1D1D1D]">
              <button
                className="flex items-center justify-between w-full py-5 md:h-[72px] text-left gap-4"
                onClick={() => setOpenIndex(isOpen ? -1 : i)}
              >
                <span className="font-display text-[14px] md:text-[16px] font-bold text-bone tracking-[1px]">
                  {faq.question}
                </span>
                <div
                  className="flex items-center justify-center w-[32px] h-[32px] shrink-0"
                  style={{ backgroundColor: isOpen ? '#FFD600' : '#1A1A1A', border: isOpen ? 'none' : '1px solid #3D3D3D' }}
                >
                  <span
                    className="font-mono text-[14px] font-bold"
                    style={{ color: isOpen ? '#0A0A0A' : '#888888' }}
                  >
                    {isOpen ? '—' : '+'}
                  </span>
                </div>
              </button>
              {isOpen && faq.answer && (
                <div className="pb-8">
                  <p className="font-mono text-[12px] md:text-[13px] text-bone-dim tracking-[1px] leading-[1.6]">
                    {faq.answer}
                  </p>
                </div>
              )}
            </div>
          );
        })}
        <div className="border-t border-t-[#1D1D1D]" />
      </div>

      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-[16px] pt-10 md:pt-[48px]">
        <span className="font-mono text-[13px] text-bone-faint tracking-[1px]">
          STILL HAVE QUESTIONS?
        </span>
        <Link
          href="/lobby"
          className="font-mono text-[13px] font-bold text-lock tracking-[1px] cursor-pointer hover:underline"
        >
          JUST TRY THE APP &gt;
        </Link>
      </div>
    </section>
  );
}
