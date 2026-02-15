/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'samurai': {
          'red': '#E63946',
          'red-dark': '#C1121F',
          'red-darker': '#8B0000',
          'red-glow': '#ff4d5a',
          'steel': '#6B7280',
          'steel-light': '#9CA3AF',
          'steel-dark': '#4B5563',
          'black': '#0A0A0A',
          'black-light': '#1A1A1A',
          'black-lighter': '#2A2A2A',
          'grey': '#374151',
          'grey-dark': '#1F2937',
          'grey-darker': '#111827',
          'gold': '#FFD700',
          'green': '#00C853',
          'green-dark': '#00A844',
          'cyan': '#00BCD4',
          'amber': '#FFA000',
        }
      },
      fontFamily: {
        'mono': ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'ticker': 'ticker 30s linear infinite',
        'ticker-slow': 'ticker 45s linear infinite',
        'glow': 'glow 2s ease-in-out infinite alternate',
        'glow-pulse': 'glowPulse 2s ease-in-out infinite',
        'flame-flicker': 'flameFlicker 2s ease-in-out infinite',
      },
      keyframes: {
        ticker: {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
        glow: {
          '0%': { boxShadow: '0 0 5px rgba(230, 57, 70, 0.3)' },
          '100%': { boxShadow: '0 0 20px rgba(230, 57, 70, 0.6)' },
        },
        glowPulse: {
          '0%, 100%': { boxShadow: '0 0 20px rgba(230, 57, 70, 0.5)' },
          '50%': { boxShadow: '0 0 40px rgba(230, 57, 70, 0.8)' },
        },
        flameFlicker: {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '0.8', transform: 'scale(1.05)' },
        },
      }
    },
  },
  plugins: [],
}
