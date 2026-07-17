const stack = ['STELLAR', 'SOROBAN', 'FREIGHTER', 'USDC', 'RUST', 'NEXT.JS'];

export default function BuiltOn() {
  return (
    <section className="flex flex-col items-center w-full bg-panel py-[48px] px-6 md:px-[120px] gap-[32px]">
      <span className="font-mono text-[11px] text-bone-faint tracking-[3px]">
        BUILT ON
      </span>
      <div className="flex flex-wrap items-center justify-center gap-8 md:gap-[64px] w-full">
        {stack.map((name) => (
          <span
            key={name}
            className="font-display text-[13px] md:text-[14px] font-bold text-bone-faint tracking-[2px]"
          >
            {name}
          </span>
        ))}
      </div>
    </section>
  );
}
