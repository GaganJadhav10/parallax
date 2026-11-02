/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Deep obsidian tiers — each step is a surface elevation, not a shade pick.
        background: '#07090E',
        surface: '#0D111A',
        'surface-raised': '#131926',
        'surface-card': '#1A2336',
        'surface-border': '#1E293B',
        'surface-border-strong': '#2A3A54',

        // Signal accents. One meaning each, used nowhere else.
        primary: {
          DEFAULT: '#00E5FF',   // intel / primary action
          hover: '#00C2D8',
          light: '#67F5FF',
          dark: '#009BB0',
        },
        signal: {
          verified: '#00F5A0',  // resolved, live, healthy
          attention: '#FFB800', // wildcard, rate limited, needs a key
          anomaly: '#FF3366',   // failed, removed, unreachable
          alias: '#A855F7',     // CNAME / delegated infrastructure
        },
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'Inter', 'sans-serif'],
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      fontSize: {
        micro: ['0.6875rem', { lineHeight: '1rem', letterSpacing: '0.03em' }],
        label: ['0.75rem', { lineHeight: '1rem', letterSpacing: '0.08em' }],
      },
      boxShadow: {
        card: '0 4px 20px -4px rgba(0, 0, 0, 0.6)',
        raised: '0 12px 40px -8px rgba(0, 0, 0, 0.8)',
        'glow-primary': '0 0 24px -6px rgba(0, 229, 255, 0.45)',
        'glow-verified': '0 0 24px -6px rgba(0, 245, 160, 0.45)',
        'glow-anomaly': '0 0 24px -6px rgba(255, 51, 102, 0.45)',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-in-right': {
          from: { opacity: '0', transform: 'translateX(12px)' },
          to: { opacity: '1', transform: 'translateX(0)' },
        },
        'pulse-border': {
          '0%, 100%': { borderColor: 'rgba(0, 229, 255, 0.25)' },
          '50%': { borderColor: 'rgba(0, 229, 255, 0.7)' },
        },
        sweep: { to: { transform: 'rotate(360deg)' } },
        shimmer: { to: { transform: 'translateX(100%)' } },
        'flow-dash': { to: { strokeDashoffset: '-16' } },
      },
      animation: {
        'fade-in': 'fade-in 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-up': 'slide-up 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-in-right': 'slide-in-right 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
        'pulse-border': 'pulse-border 2.2s ease-in-out infinite',
        sweep: 'sweep 4s linear infinite',
        shimmer: 'shimmer 1.8s infinite',
        'flow-dash': 'flow-dash 0.6s linear infinite',
      },
    },
  },
  plugins: [],
}
