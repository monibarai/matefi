'use client';

import GlitchText from './GlitchText';

interface SectionHeaderProps {
  label: string;
  title: string;
  subtitle?: string;
  titleWidth?: string;
  subtitleWidth?: string;
}

export default function SectionHeader({
  label,
  title,
  subtitle,
  titleWidth = 'w-full max-w-[700px]',
  subtitleWidth = 'w-full max-w-[600px]',
}: SectionHeaderProps) {
  return (
    <div className="flex flex-col gap-[16px] w-full">
      <span className="font-mono text-[10px] md:text-[12px] font-bold text-lock tracking-[1.5px] md:tracking-[3px]">
        <GlitchText text={label} speed={30} />
      </span>
      <h2
        className={`font-display text-[36px] md:text-[56px] font-bold text-bone tracking-[-1px] leading-[1.05] whitespace-pre-line ${titleWidth}`}
      >
        <GlitchText text={title} speed={40} delay={150} />
      </h2>
      {subtitle && (
        <p
          className={`font-mono text-[10px] md:text-[13px] text-bone-faint tracking-[0.5px] md:tracking-[1px] leading-[1.6] text-pretty ${subtitleWidth}`}
        >
          <GlitchText text={subtitle} speed={20} delay={350} />
        </p>
      )}
    </div>
  );
}
