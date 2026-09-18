/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        dark: {
          900: '#0b0f12',
          850: '#11171b',
          800: '#182126',
          700: '#273238',
          600: '#3a474e',
          500: '#59666c',
        },
        brand: {
          DEFAULT: '#82b5a4',
          hover: '#9bc7b8',
        },
        log: {
          v: '#9ca3af',
          d: '#60a5fa',
          i: '#34d399',
          w: '#fbbf24',
          e: '#f87171',
          a: '#ef4444',
        }
      },
      fontFamily: {
        sans: ['Noto Sans SC', 'Microsoft YaHei UI', 'PingFang SC', 'Segoe UI', 'sans-serif'],
        mono: ['JetBrainsMono NFM', 'JetBrains Mono', 'Cascadia Mono', 'Cascadia Code', 'Consolas', 'monospace'],
      }
    },
  },
  plugins: [],
}
