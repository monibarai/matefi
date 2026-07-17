import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // "pixel-terminal chess" palette — ported from the PixelCraft design system
        ink: {
          DEFAULT: '#0A0A0A', // page background
          deep: '#050505',
          raise: '#111111',
        },
        panel: {
          DEFAULT: '#111111',
          2: '#161616',
        },
        edge: {
          DEFAULT: '#2D2D2D',
          bright: '#3D3D3D',
        },
        bone: {
          DEFAULT: '#F5F5F0', // primary text
          dim: '#888888',
          faint: '#555555',
        },
        lock: {
          DEFAULT: '#FFD600', // pixel yellow — primary accent / market lock
          dim: '#8A7A00',
          wash: 'rgba(255, 214, 0, 0.08)',
        },
        long: {
          DEFAULT: '#4ADE80', // green — bullish / win
          wash: 'rgba(74, 222, 128, 0.10)',
        },
        short: {
          DEFAULT: '#FF6B35', // orange-red — bearish / loss
          wash: 'rgba(255, 107, 53, 0.10)',
        },
        draw: {
          DEFAULT: '#8B93A8', // slate — draw outcome
        },
      },
      fontFamily: {
        display: ['var(--font-display)', 'sans-serif'],
        sans: ['var(--font-body)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        panel: '0 1px 0 0 rgba(255,255,255,0.03) inset, 0 12px 32px -16px rgba(0,0,0,0.8)',
        glow: '0 0 24px -6px rgba(255, 214, 0, 0.35)',
      },
      animation: {
        'pulse-dot': 'pulse-dot 1.6s ease-in-out infinite',
        'rise-in': 'rise-in 0.45s cubic-bezier(0.22, 1, 0.36, 1) both',
        shimmer: 'shimmer 1.8s linear infinite',
      },
      keyframes: {
        'pulse-dot': {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '0.45', transform: 'scale(0.8)' },
        },
        'rise-in': {
          from: { opacity: '0', transform: 'translateY(10px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          from: { backgroundPosition: '200% 0' },
          to: { backgroundPosition: '-200% 0' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
