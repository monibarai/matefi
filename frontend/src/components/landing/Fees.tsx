import SectionHeader from './SectionHeader';

interface FeeCardProps {
  tier: string;
  tierColor?: string;
  name: string;
  nameColor?: string;
  detail: string;
  detailColor?: string;
  bgColor?: string;
  borderColor?: string;
  borderWidth?: number;
  tierBg?: string;
  tierBorderColor?: string;
  points: string[];
  accentColor?: string;
}

function FeeCard({
  tier,
  tierColor = '#888888',
  name,
  nameColor = '#F5F5F0',
  detail,
  detailColor = '#F5F5F0',
  bgColor = '#0F0F0F',
  borderColor = '#2D2D2D',
  borderWidth = 1,
  tierBg = '#1A1A1A',
  tierBorderColor = '#3D3D3D',
  points,
  accentColor = '#555555',
}: FeeCardProps) {
  return (
    <div
      className="flex flex-col gap-8 p-8 md:p-[40px] w-full md:flex-1"
      style={{ backgroundColor: bgColor, border: `${borderWidth}px solid ${borderColor}` }}
    >
      <div
        className="flex items-center justify-center h-[28px] px-[12px] w-fit"
        style={{ backgroundColor: tierBg, border: `1px solid ${tierBorderColor}` }}
      >
        <span className="font-mono text-[11px] tracking-[2px]" style={{ color: tierColor }}>
          {tier}
        </span>
      </div>
      <span className="font-display text-[24px] font-bold tracking-[1px]" style={{ color: nameColor }}>
        {name}
      </span>
      <span className="font-mono text-[13px] tracking-[1px] leading-[1.5]" style={{ color: detailColor }}>
        {detail}
      </span>

      <div className="flex flex-col gap-[10px]" style={{ borderTop: `1px solid ${borderColor}` }}>
        <div className="pt-6 flex flex-col gap-[10px]">
          {points.map((p, i) => (
            <div key={i} className="flex items-center gap-3">
              <span className="font-mono text-[14px] leading-none shrink-0" style={{ color: accentColor }}>
                +
              </span>
              <span className="font-mono text-[11px] tracking-[1px] text-[#A0A09A]">{p}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Fees() {
  return (
    <section id="pricing" className="flex flex-col w-full bg-[#080808] py-16 px-6 md:py-[100px] md:px-[120px] gap-12 md:gap-[64px]">
      <SectionHeader
        label="[09] // FEE STRUCTURE"
        title={'NO HOUSE EDGE.\nJUST NETWORK FEES.'}
        subtitle="MATEFI DOESN'T CUSTODY OR SKIM YOUR STAKE. HERE'S EXACTLY WHERE VALUE MOVES."
      />

      <div className="flex flex-col md:flex-row w-full gap-[2px]">
        <FeeCard
          tier="EVERY MATCH"
          name="PLAYER STAKE"
          detail="SET YOUR OWN STAKE IN USDC"
          points={[
            'FULL STAKE LOCKS IN escrow_vault',
            'WINNER TAKES THE POOL ON SETTLEMENT',
            'DRAW SPLITS THE ESCROW EVENLY',
            'STELLAR NETWORK FEE: SUB-CENT PER TX',
          ]}
          accentColor="#555555"
        />
        <FeeCard
          tier="LIVE MARKET"
          tierColor="#0A0A0A"
          tierBg="#FFD600"
          tierBorderColor="#FFD600"
          name="PREDICTION POOL"
          nameColor="#FFD600"
          detail="TRADE THE OUTCOME WHILE THE GAME IS LIVE"
          detailColor="#FFD600"
          bgColor="#111111"
          borderColor="#FFD600"
          borderWidth={2}
          points={[
            'PARIMUTUEL PRICING FROM POOL TOTALS',
            'A SHARE OF TRADING FEES FLOWS BACK INTO THE PLAYER PRIZE POOL',
            'MARKET AUTO-LOCKS NEAR A DECISIVE POSITION',
            'PAYOUT RELEASES ON SETTLEMENT, ON-CHAIN',
          ]}
          accentColor="#FFD600"
        />
        <FeeCard
          tier="DISPUTED MATCHES"
          tierColor="#FF6B35"
          tierBorderColor="#FF6B35"
          name="ARBITRATION"
          detail="ONLY CHARGED IF A DISPUTE IS OPENED"
          points={[
            'EITHER PLAYER CAN CONTEST WITHIN THE FINALIZE WINDOW',
            'ARBITER REVIEWS MOVE HISTORY + ANTI-CHEAT FLAGS',
            'RESOLUTION IS RECORDED ON-CHAIN',
            'NO FEE IF THE MATCH SETTLES CLEANLY',
          ]}
          accentColor="#FF6B35"
        />
      </div>
    </section>
  );
}
