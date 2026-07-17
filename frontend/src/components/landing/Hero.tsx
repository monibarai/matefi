'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import GlitchText from './GlitchText';
import LiveCursors from './LiveCursors';

export default function Hero() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <section className="relative flex flex-col items-center w-full bg-ink py-16 px-6 md:py-[100px] md:px-[120px] overflow-hidden">
      {/* Badge */}
      <div className="flex items-center justify-center gap-[8px] h-[32px] px-[12px] md:px-[16px] bg-panel border-2 border-lock">
        <div className="w-[8px] h-[8px] bg-lock shrink-0" />
        <span className="font-mono text-[9px] md:text-[11px] font-bold text-lock tracking-[1px] md:tracking-[2px] whitespace-nowrap">
          [LIVE] // STELLAR SOROBAN TESTNET
        </span>
      </div>

      <div className="h-8 md:h-[32px]" />

      {/* Headline */}
      <h1 className="font-display text-[clamp(32px,10vw,96px)] font-bold text-bone tracking-[-1px] leading-none text-center w-full max-w-[1100px]">
        <GlitchText text="CHECKMATE." speed={45} delay={100} />
        <br />
        <GlitchText text="CASHED OUT." speed={45} delay={400} />
      </h1>
      <h1 className="font-display text-[clamp(32px,10vw,96px)] font-bold text-lock tracking-[-1px] leading-none text-center w-full max-w-[1100px]">
        <GlitchText text="ON-CHAIN." speed={45} delay={700} />
      </h1>

      <div className="h-8 md:h-[32px]" />

      {/* Subheading */}
      <p className="font-mono text-[13px] md:text-[15px] text-bone-dim tracking-[1px] leading-[1.6] text-center w-full max-w-[800px]">
        P2P CHESS BETTING FUSED WITH A LIVE PARIMUTUEL PREDICTION MARKET.
        <br />
        USDC ESCROW. STOCKFISH ANTI-CHEAT. NO HOUSE, NO CUSTODY.
      </p>

      <div className="h-10 md:h-[48px]" />

      {/* CTAs */}
      <div className="flex flex-col sm:flex-row items-center gap-4 md:gap-[16px] w-full sm:w-auto">
        <Link
          href="/lobby"
          className="flex items-center justify-center w-full sm:w-[220px] h-[56px] bg-lock hover:bg-[#e6c200] transition-colors"
        >
          <span className="font-display text-[12px] font-bold text-ink-deep tracking-[2px]">
            ENTER THE LOBBY
          </span>
        </Link>
        <Link
          href="/create"
          className="flex items-center justify-center w-full sm:w-[200px] h-[56px] bg-ink border-2 border-edge-bright hover:border-bone-dim transition-colors"
        >
          <span className="font-mono text-[12px] text-bone-dim tracking-[2px]">
            CREATE MATCH &gt;
          </span>
        </Link>
      </div>

      <div className="h-6 md:h-[24px]" />

      <p className="font-mono text-[11px] text-bone-faint tracking-[2px] text-center">
        NO SIGNUP // FREIGHTER WALLET // 5 CONTRACTS LIVE ON TESTNET
      </p>

      <div className="h-12 md:h-[64px]" />

      {/* Animated match interface */}
      <div className="w-full max-w-[1100px] bg-panel overflow-hidden" style={{ border: '2px solid #2D2D2D' }}>
        <MatchInterfaceSVG mounted={mounted} />
      </div>

      <LiveCursors />
    </section>
  );
}

/* ──────────────────────────────── SVG ──────────────────────────────── */

const layers = [
  { label: 'FRAME / MATCH #0231', color: '#FFD600', indent: 0, active: true },
  { label: 'NAVBAR', color: '#888', indent: 12 },
  { label: 'CHESS BOARD', color: '#4ADE80', indent: 12 },
  { label: 'EVAL BAR', color: '#888', indent: 12 },
  { label: 'PREDICTION MARKET', color: '#FF6B35', indent: 12 },
  { label: 'BET / WHITE', color: '#FF6B35', indent: 24 },
  { label: 'BET / BLACK', color: '#888', indent: 24 },
  { label: 'MOVE HISTORY', color: '#60A5FA', indent: 12 },
  { label: 'ESCROW STATUS', color: '#888', indent: 0 },
];

const inspectProps = [
  { key: 'STAKE', val: '250 USDC' },
  { key: 'POOL', val: '1,840 USDC' },
  { key: 'WHITE', val: '55%', swatch: '#F5F5F0' },
  { key: 'DRAW', val: '12%', swatch: '#8B93A8' },
  { key: 'BLACK', val: '33%', swatch: '#333333' },
  { key: 'LOCK', val: '±2.5 cp' },
  { key: 'FINALITY', val: '~5s' },
  { key: 'STATUS', val: 'ACTIVE', swatch: '#4ADE80' },
];

const tokens = [
  { name: 'lock (accent)', hex: '#FFD600' },
  { name: 'long (win)', hex: '#4ADE80' },
  { name: 'short (loss)', hex: '#FF6B35' },
  { name: 'bone (text)', hex: '#F5F5F0' },
  { name: 'faint', hex: '#555555' },
];

const codeLines = [
  { w: 80, color: '#4ADE80', x: 325 },
  { w: 140, color: '#60A5FA', x: 345 },
  { w: 100, color: '#888', x: 355 },
  { w: 120, color: '#FF6B35', x: 345 },
  { w: 90, color: '#888', x: 355 },
  { w: 160, color: '#4ADE80', x: 355 },
  { w: 80, color: '#888', x: 345 },
  { w: 110, color: '#60A5FA', x: 325 },
];

const handles: [number, number][] = [
  [280, 90], [570, 90], [860, 90],
  [280, 280], [860, 280],
  [280, 470], [570, 470], [860, 470],
];

const tickerItems = [
  'SICILIAN', 'RUY LOPEZ', "KING'S GAMBIT", 'CARO-KANN', 'FRENCH DEFENSE',
  'ITALIAN GAME', 'SCOTCH GAME', 'PIRC DEFENSE', 'NIMZO-INDIAN', "QUEEN'S GAMBIT",
];

function MatchInterfaceSVG({ mounted }: { mounted: boolean }) {
  return (
    <>
      <style>{`
        @keyframes hero-blink { 0%,100%{opacity:1} 50%{opacity:0} }
        @keyframes hero-scan { 0%{transform:translateY(-580px)} 100%{transform:translateY(580px)} }
        @keyframes hero-pulse { 0%,100%{opacity:0.3} 50%{opacity:1} }
        @keyframes hero-ticker { 0%{transform:translateX(0)} 100%{transform:translateX(-700px)} }
        .hero-cursor { animation: hero-blink 1.1s step-end infinite; }
        .hero-scan { animation: hero-scan 4s linear infinite; }
        .hero-pulse { animation: hero-pulse 2s ease-in-out infinite; }
        .hero-ticker-track { animation: hero-ticker 14s linear infinite; }
      `}</style>

      <svg
        viewBox="0 0 1100 580"
        xmlns="http://www.w3.org/2000/svg"
        style={{ display: 'block', width: '100%', height: 'auto' }}
      >
        <rect width="1100" height="580" fill="#0F0F0F" />

        <rect className="hero-scan" x="0" y="0" width="1100" height="6" fill="rgba(255,214,0,0.03)" />

        {Array.from({ length: 22 }, (_, c) =>
          Array.from({ length: 12 }, (_, r) => (
            <circle key={`d${c}-${r}`} cx={c * 50 + 25} cy={r * 50 + 25} r="1" fill="#1A1A1A" />
          )),
        )}

        {/* ── LEFT PANEL ── */}
        <rect x="0" y="0" width="200" height="580" fill="#111111" />
        <line x1="200" y1="0" x2="200" y2="580" stroke="#2D2D2D" strokeWidth="1" />

        <rect x="0" y="0" width="200" height="36" fill="#161616" />
        <text x="12" y="23" fontFamily="monospace" fontSize="9" fill="#FFD600" letterSpacing={2} fontWeight="700">LAYERS</text>
        <text x="176" y="23" fontFamily="monospace" fontSize="12" fill="#444">+</text>

        {layers.map((l, i) => {
          const y = 36 + i * 32;
          return (
            <g
              key={i}
              style={{
                opacity: mounted ? 1 : 0,
                transform: mounted ? 'translateY(0)' : 'translateY(6px)',
                transition: `opacity 0.4s ease ${i * 0.08}s, transform 0.4s ease ${i * 0.08}s`,
              }}
            >
              {l.active && <rect x="0" y={y} width="200" height="32" fill="#1E1E1E" />}
              {l.active && <rect x="0" y={y} width="2" height="32" fill="#FFD600" />}
              <circle cx={20 + l.indent} cy={y + 16} r="3" fill={l.color} opacity="0.8" />
              <text x={32 + l.indent} y={y + 20} fontFamily="monospace" fontSize="9" fill={l.active ? '#F5F5F0' : '#555'} letterSpacing={0.5}>
                {l.label}
              </text>
            </g>
          );
        })}

        {/* ── RIGHT PANEL ── */}
        <rect x="899" y="0" width="201" height="580" fill="#111111" />
        <line x1="899" y1="0" x2="899" y2="580" stroke="#2D2D2D" strokeWidth="1" />
        <rect x="899" y="0" width="201" height="36" fill="#161616" />
        <text x="912" y="23" fontFamily="monospace" fontSize="9" fill="#FFD600" letterSpacing={2} fontWeight="700">POOL</text>

        {inspectProps.map((p, i) => {
          const y = 56 + i * 26;
          return (
            <g
              key={i}
              style={{
                opacity: mounted ? 1 : 0,
                transition: `opacity 0.4s ease ${0.1 + i * 0.06}s`,
              }}
            >
              <text x="912" y={y} fontFamily="monospace" fontSize="8" fill="#555" letterSpacing={1}>{p.key}</text>
              {p.swatch && <rect x="970" y={y - 9} width="10" height="10" fill={p.swatch} rx="1" />}
              <text x={p.swatch ? '986' : '970'} y={y} fontFamily="monospace" fontSize="8" fill="#888" letterSpacing={0.5}>{p.val}</text>
            </g>
          );
        })}

        <line x1="899" y1="278" x2="1100" y2="278" stroke="#222" strokeWidth="1" />
        <text x="912" y="300" fontFamily="monospace" fontSize="9" fill="#FFD600" letterSpacing={2} fontWeight="700">TOKENS</text>

        {tokens.map((t, i) => {
          const y = 316 + i * 28;
          return (
            <g key={i}>
              <rect x="912" y={y} width="12" height="12" fill={t.hex} rx="1" />
              <text x="932" y={y + 10} fontFamily="monospace" fontSize="8" fill="#666" letterSpacing={0.5}>{t.name}</text>
              <text x="1020" y={y + 10} fontFamily="monospace" fontSize="7" fill="#444" letterSpacing={0.5}>{t.hex}</text>
            </g>
          );
        })}

        {/* ── CENTER CANVAS ── */}
        <rect x="200" y="0" width="700" height="36" fill="#141414" />
        <line x1="200" y1="36" x2="900" y2="36" stroke="#2D2D2D" strokeWidth="1" />

        {['♟', '♞', '♝', '♜'].map((label, t) => (
          <g key={t}>
            <rect x={218 + t * 28} y="9" width="18" height="18" rx="2" fill={t === 0 ? '#FFD600' : '#1E1E1E'} />
            <text x={223 + t * 28} y="22" fontFamily="monospace" fontSize="10" fill={t === 0 ? '#0A0A0A' : '#666'}>{label}</text>
          </g>
        ))}
        <line x1="340" y1="11" x2="340" y2="25" stroke="#2D2D2D" strokeWidth="1" />
        <text x="356" y="23" fontFamily="monospace" fontSize="9" fill="#555" letterSpacing={1}>MATCH #0231</text>

        {/* Frame (selected) */}
        <rect x="280" y="90" width="540" height="380" fill="#0A0A0A" stroke="#FFD600" strokeWidth="1.5" strokeDasharray="4 2" />
        <text x="280" y="84" fontFamily="monospace" fontSize="8" fill="#FFD600" letterSpacing={1}>FRAME / LIVE MATCH — 640 x 640</text>

        {handles.map(([hx, hy], i) => (
          <rect key={`h${i}`} x={hx - 3} y={hy - 3} width="6" height="6" fill="#FFD600" stroke="#0A0A0A" strokeWidth="1" />
        ))}

        {/* Mini chessboard */}
        {Array.from({ length: 8 }, (_, r) =>
          Array.from({ length: 8 }, (_, c) => (
            <rect
              key={`sq${r}-${c}`}
              x={300 + c * 20}
              y={104 + r * 20}
              width="20"
              height="20"
              fill={(r + c) % 2 === 0 ? '#2D2D2D' : '#1A1A1A'}
            />
          )),
        )}
        <rect x="300" y="104" width="160" height="160" fill="none" stroke="#3D3D3D" strokeWidth="1" />
        {/* a few "pieces" as pixel blocks */}
        <rect x="304" y="228" width="12" height="12" fill="#F5F5F0" />
        <rect x="344" y="228" width="12" height="12" fill="#F5F5F0" />
        <rect x="384" y="228" width="12" height="12" fill="#F5F5F0" />
        <rect x="424" y="228" width="12" height="12" fill="#F5F5F0" />
        <rect x="304" y="124" width="12" height="12" fill="#666" />
        <rect x="344" y="124" width="12" height="12" fill="#666" />
        <rect x="424" y="124" width="12" height="12" fill="#666" />

        {/* Eval bar */}
        <rect x="470" y="104" width="10" height="160" fill="#1A1A1A" stroke="#2D2D2D" strokeWidth="1" />
        <rect x="470" y="160" width="10" height="104" fill="#F5F5F0" />

        {/* Headline + odds */}
        <rect x="500" y="112" width="220" height="16" rx="1" fill="#F5F5F0" opacity="0.9" />
        <rect x="500" y="134" width="160" height="14" rx="1" fill="#FFD600" opacity="0.9" />
        <rect x="500" y="158" width="200" height="5" rx="1" fill="#444" />
        <rect x="500" y="169" width="170" height="5" rx="1" fill="#333" />

        {/* CTA buttons */}
        <rect x="500" y="190" width="100" height="24" fill="#FFD600" />
        <text x="512" y="206" fontFamily="monospace" fontSize="7" fill="#0A0A0A" fontWeight="700" letterSpacing={0.5}>BET WHITE</text>
        <rect x="608" y="190" width="90" height="24" fill="none" stroke="#FF6B35" strokeWidth="1.5" />
        <text x="620" y="206" fontFamily="monospace" fontSize="7" fill="#FF6B35" letterSpacing={0.5}>BET BLACK</text>

        {/* Trading / pool panel */}
        <rect x="310" y="280" width="490" height="168" fill="#161616" stroke="#222" strokeWidth="1" />
        <rect x="310" y="280" width="490" height="18" fill="#1A1A1A" />
        <circle cx="322" cy="289" r="3" fill="#FF6B35" />
        <circle cx="332" cy="289" r="3" fill="#FFD600" />
        <circle cx="342" cy="289" r="3" fill="#4ADE80" />
        <text x="360" y="293" fontFamily="monospace" fontSize="7" fill="#333" letterSpacing={1}>prediction_pool.get_odds() — MateFi</text>

        {codeLines.map((cl, i) => (
          <rect key={`cl${i}`} x={cl.x} y={308 + i * 16} width={cl.w} height="5" rx="1" fill={cl.color} opacity="0.35" />
        ))}

        <rect className="hero-cursor" x="465" y="340" width="6" height="10" fill="#FFD600" opacity="0.9" />

        {/* Measurement guides */}
        <line x1="820" y1="148" x2="860" y2="148" stroke="#FF6B35" strokeWidth="0.75" strokeDasharray="3 2" />
        <line x1="820" y1="190" x2="860" y2="190" stroke="#FF6B35" strokeWidth="0.75" strokeDasharray="3 2" />
        <line x1="850" y1="148" x2="850" y2="190" stroke="#FF6B35" strokeWidth="0.75" />
        <text x="835" y="173" fontFamily="monospace" fontSize="7" fill="#FF6B35" letterSpacing={0.5}>42px</text>

        <line x1="500" y1="180" x2="500" y2="190" stroke="#60A5FA" strokeWidth="0.75" strokeDasharray="2 2" />
        <line x1="600" y1="180" x2="600" y2="190" stroke="#60A5FA" strokeWidth="0.75" strokeDasharray="2 2" />
        <text x="535" y="187" fontFamily="monospace" fontSize="7" fill="#60A5FA" letterSpacing={0.5}>8px</text>

        {/* Ticker: chess openings */}
        <line x1="200" y1="514" x2="900" y2="514" stroke="#2D2D2D" strokeWidth="1" />
        <rect x="200" y="515" width="700" height="32" fill="#0F0F0F" />
        <clipPath id="tickerClip">
          <rect x="200" y="515" width="700" height="32" />
        </clipPath>
        <g clipPath="url(#tickerClip)">
          <g className="hero-ticker-track">
            {[...tickerItems, ...tickerItems].map((name, i) => (
              <g key={`t${i}`}>
                <circle cx={220 + i * 70} cy="531" r="3" fill="#FFD600" opacity="0.5" />
                <text x={230 + i * 70} y="535" fontFamily="monospace" fontSize="8" fill="#444" letterSpacing={1.5}>{name}</text>
              </g>
            ))}
          </g>
        </g>

        {/* Status bar */}
        <line x1="200" y1="547" x2="900" y2="547" stroke="#222" strokeWidth="1" />
        <rect x="200" y="548" width="700" height="32" fill="#0D0D0D" />
        <circle className="hero-pulse" cx="220" cy="564" r="4" fill="#4ADE80" />
        <text x="232" y="568" fontFamily="monospace" fontSize="8" fill="#555" letterSpacing={1}>LIVE</text>
        <text x="290" y="568" fontFamily="monospace" fontSize="8" fill="#333" letterSpacing={1}>ESCROW LOCKED</text>
        <text x="430" y="568" fontFamily="monospace" fontSize="8" fill="#333" letterSpacing={1}>STOCKFISH ANTI-CHEAT ON</text>
        <text x="650" y="568" fontFamily="monospace" fontSize="8" fill="#333" letterSpacing={1}>NETWORK: TESTNET</text>
        <text x="820" y="568" fontFamily="monospace" fontSize="8" fill="#333" letterSpacing={1}>~5s</text>

        <rect x="200" y="548" width="6" height="6" fill="#FFD600" opacity="0.5" />
        <rect x="894" y="548" width="6" height="6" fill="#FF6B35" opacity="0.4" />
      </svg>
    </>
  );
}
