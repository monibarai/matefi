import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // "chess x trading terminal" palette
        ink: {
          DEFAULT: '#0A0C10', // page background
          deep: '#07080B',
          raise: '#0E1117',
        },
        panel: {
          DEFAULT: '#11141B',
          2: '#151924',
        },
        edge: {
          DEFAULT: '#1E2430',
          bright: '#2C3545',
        },
        bone: {
          DEFAULT: '#E9E6DE', // primary text — old ivory chess piece white
          dim: '#9AA1B0',
          faint: '#5C6373',
        },
        lock: {
          DEFAULT: '#F2A93B', // amber — market lock accent
          dim: '#8A6420',
          wash: 'rgba(242, 169, 59, 0.08)',
        },
        long: {
          DEFAULT: '#2FBF8F', // emerald — bullish / win
          wash: 'rgba(47, 191, 143, 0.10)',
        },
        short: {
          DEFAULT: '#E25A6B', // rose — bearish / loss
          wash: 'rgba(226, 90, 107, 0.10)',
        },
        draw: {
          DEFAULT: '#8B93A8', // slate — draw outcome
        },
      },
      fontFamily: {
        display: ['var(--font-display)', 'serif'],
        sans: ['var(--font-body)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        panel: '0 1px 0 0 rgba(255,255,255,0.03) inset, 0 12px 32px -16px rgba(0,0,0,0.8)',
        glow: '0 0 24px -6px rgba(242, 169, 59, 0.35)',
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
