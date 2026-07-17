import SectionHeader from './SectionHeader';

interface FeatureCardProps {
  iconColor: string;
  title: string;
  description: string;
  tag: string;
  tagColor: string;
  bgColor?: string;
  borderColor?: string;
}

function FeatureCard({
  iconColor,
  title,
  description,
  tag,
  tagColor,
  bgColor = '#111111',
  borderColor = '#2D2D2D',
}: FeatureCardProps) {
  return (
    <div
      className="flex flex-col gap-5 p-8 md:p-[32px] border w-full md:flex-1 md:h-[320px]"
      style={{ backgroundColor: bgColor, borderColor }}
    >
      <div className="w-[40px] h-[40px] shrink-0" style={{ backgroundColor: iconColor }} />
      <h3 className="font-display text-[18px] font-bold text-bone tracking-[1px] leading-[1.2] whitespace-pre-line">
        {title}
      </h3>
      <p className="font-mono text-[12px] text-bone-dim tracking-[1px] leading-[1.6]">
        {description}
      </p>
      <div
        className="flex items-center justify-center h-[28px] px-[12px] bg-panel border w-fit"
        style={{ borderColor: tagColor }}
      >
        <span className="font-mono text-[11px] tracking-[2px]" style={{ color: tagColor }}>
          {tag}
        </span>
      </div>
    </div>
  );
}

export default function Features() {
  return (
    <section
      id="features"
      className="flex flex-col w-full bg-ink py-16 px-6 md:py-[100px] md:px-[120px] gap-12 md:gap-[64px]"
    >
      <SectionHeader
        label="[01] // FEATURES"
        title={'YOUR MOVES.\nYOUR ESCROW.\nYOUR PAYOUT.'}
        subtitle="NO CUSTODIAL BOOKMAKER. EVERY STAKE LIVES IN A SOROBAN CONTRACT UNTIL THE GAME ENDS."
      />

      <div className="flex flex-col md:flex-row w-full gap-[2px]">
        <FeatureCard
          iconColor="#FFD600"
          title={'TRUSTLESS\nUSDC ESCROW'}
          description="BOTH PLAYERS' STAKES LOCK INTO escrow_vault ON MATCH START. NO ADMIN KEY CAN TOUCH IT UNTIL SETTLEMENT."
          tag="CORE"
          tagColor="#FFD600"
          borderColor="#FFD600"
        />
        <FeatureCard
          iconColor="#FF6B35"
          title={'LIVE PARIMUTUEL\nPREDICTION MARKET'}
          description="SPECTATORS TRADE ON THE OUTCOME WHILE THE GAME IS LIVE. ODDS SHIFT WITH EVERY MOVE, PRICED FROM POOL TOTALS."
          tag="MARKET"
          tagColor="#FF6B35"
          bgColor="#0F0F0F"
          borderColor="#FF6B35"
        />
        <FeatureCard
          iconColor="#F5F5F0"
          title={'STOCKFISH\nANTI-CHEAT'}
          description="EVERY PLY IS EVALUATED AGAINST ENGINE BESTMOVE. ABNORMAL MATCH RATES FLAG THE GAME FOR ARBITER REVIEW."
          tag="FAIR PLAY"
          tagColor="#888888"
          borderColor="#555555"
        />
      </div>
    </section>
  );
}
