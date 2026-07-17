import SectionHeader from './SectionHeader';

interface ProofCardProps {
  quote: string;
  name: string;
  role: string;
  bgColor?: string;
  accentColor: string;
}

function ProofCard({ quote, name, role, bgColor = '#111111', accentColor }: ProofCardProps) {
  return (
    <div
      className="flex flex-col gap-6 p-8 md:p-[40px] border-l-4 w-full md:flex-1"
      style={{ backgroundColor: bgColor, borderLeftColor: accentColor }}
    >
      <p className="font-mono text-[13px] text-bone-dim tracking-[1px] leading-[1.6]">
        {quote}
      </p>
      <div className="flex items-center gap-[12px]">
        <div className="w-[36px] h-[36px] shrink-0" style={{ backgroundColor: accentColor }} />
        <div className="flex flex-col gap-[2px]">
          <span className="font-display text-[13px] font-bold text-bone tracking-[1px]">
            {name}
          </span>
          <span className="font-mono text-[11px] text-bone-faint tracking-[1px]">
            {role}
          </span>
        </div>
      </div>
    </div>
  );
}

export default function Proof() {
  return (
    <section className="flex flex-col w-full bg-ink py-16 px-6 md:py-[100px] md:px-[120px] gap-12 md:gap-[64px]">
      <SectionHeader
        label="[04] // UNDER THE HOOD"
        title={'BUILT TO BE\nVERIFIED, NOT TRUSTED.'}
      />

      <div className="flex flex-col md:flex-row w-full gap-[2px]">
        <ProofCard
          quote="EVERY CONTRACT ADDRESS IS PUBLISHED AND EXPLORABLE ON STELLAR.EXPERT. NOTHING ABOUT SETTLEMENT LOGIC IS HIDDEN BEHIND A BACKEND."
          name="TRANSPARENCY"
          role="5 SOROBAN CONTRACTS · TESTNET"
          accentColor="#FFD600"
        />
        <ProofCard
          quote="A SUBMIT / FINALIZE / DISPUTE / RESOLVE STATE MACHINE GIVES EITHER PLAYER A WINDOW TO CONTEST A RESULT BEFORE PAYOUT IS FINAL."
          name="DISPUTE RESOLUTION"
          role="ON-CHAIN ARBITER KEEPER"
          bgColor="#0D0D0D"
          accentColor="#FF6B35"
        />
        <ProofCard
          quote="EVERY MOVE IS COMPARED AGAINST A STOCKFISH BESTMOVE AT MATCH-TIME. ABNORMAL MATCH-RATE PATTERNS SURFACE AS EVIDENCE, NOT AUTO-BANS."
          name="ANTI-CHEAT"
          role="ENGINE-ASSISTED REVIEW"
          accentColor="#F5F5F0"
        />
      </div>
    </section>
  );
}
