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
          'black': '#0a0a0a',
          'black-light': '#141414',
          'black-lighter': '#1a1a1a',
          'red': '#E63946',
          'red-dark': '#C62828',
          'red-glow': '#ff4d5a',
          'grey': '#2d2d2d',
          'grey-dark': '#1e1e1e',
          'grey-darker': '#161616',
          'steel': '#8a8a8a',
          'steel-light': '#b0b0b0',
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
      },
      keyframes: {
        ticker: {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
        glow: {
          '0%': { boxShadow: '0 0 5px rgba(230, 57, 70, 0.3)' },
          '100%': { boxShadow: '0 0 20px rgba(230, 57, 70, 0.6)' },
        }
      }
    },
  },
  plugins: [],
}
