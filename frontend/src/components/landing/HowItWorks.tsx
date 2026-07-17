import SectionHeader from './SectionHeader';

interface StepCardProps {
  number: string;
  title: string;
  description: string;
  bgColor?: string;
  borderColor?: string;
  borderWidth?: number;
}

function StepCard({
  number,
  title,
  description,
  bgColor = '#0A0A0A',
  borderColor = '#2D2D2D',
  borderWidth = 1,
}: StepCardProps) {
  return (
    <div
      className="flex flex-col gap-4 p-8 md:p-[40px] border w-full md:flex-1 md:h-[260px]"
      style={{ backgroundColor: bgColor, borderColor, borderWidth }}
    >
      <span className="font-display text-[48px] font-bold text-lock tracking-[-2px]">
        {number}
      </span>
      <h3 className="font-display text-[20px] font-bold text-bone tracking-[1px] leading-[1.2] whitespace-pre-line">
        {title}
      </h3>
      <p className="font-mono text-[11px] text-bone-faint tracking-[1px] leading-[1.5]">
        {description}
      </p>
    </div>
  );
}

export default function HowItWorks() {
  return (
    <section className="flex flex-col w-full bg-ink-raise py-16 px-6 md:py-[100px] md:px-[120px] gap-12 md:gap-[64px]">
      <SectionHeader
        label="[02] // HOW IT WORKS"
        title={'STAKE. PLAY.\nSETTLE ON-CHAIN.'}
      />

      <div className="flex flex-col md:flex-row w-full gap-[2px]">
        <StepCard
          number="01"
          title={'CREATE OR\nJOIN A MATCH'}
          description="CONNECT FREIGHTER, SET YOUR USDC STAKE. AN OPPONENT JOINS AND BOTH STAKES LOCK INTO ESCROW."
        />
        <StepCard
          number="02"
          title={'PLAY WHILE\nTHE MARKET TRADES'}
          description="MAKE MOVES ON-BOARD. SPECTATORS BET ON THE OUTCOME LIVE — ODDS AUTO-LOCK NEAR DECISIVE POSITIONS."
          bgColor="#111111"
          borderColor="#FFD600"
          borderWidth={1}
        />
        <StepCard
          number="03"
          title={'SETTLE AND\nGET PAID'}
          description="CHECKMATE, RESIGN, OR TIMEOUT TRIGGERS SETTLEMENT. ESCROW RELEASES AND THE PREDICTION POOL PAYS OUT."
        />
      </div>
    </section>
  );
}
