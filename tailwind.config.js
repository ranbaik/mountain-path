/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // 산길: 이끼·숲 초록
        moss: { 50: '#f3f7f1', 100: '#e3eedc', 200: '#c7dcbb', 300: '#a4c493', 400: '#7da66a', 500: '#5a8a4a', 600: '#44703a', 700: '#34562d', 800: '#26401f' },
        // 새벽 햇살 (강조)
        dawn: { 50: '#fff8ef', 100: '#fdeedd', 300: '#f7c48b', 500: '#e7964a', 700: '#b0621f' },
        ink: { 900: '#2b302a', 700: '#4a5248', 500: '#737c70', 300: '#b9c0b5' },
      },
      fontFamily: {
        sans: ['Pretendard', '-apple-system', 'BlinkMacSystemFont', 'Apple SD Gothic Neo', 'Noto Sans KR', 'sans-serif'],
        serif: ['"Noto Serif KR"', 'Nanum Myeongjo', 'serif'],
      },
      boxShadow: { card: '0 6px 24px -12px rgba(38, 64, 31, 0.3)' },
    },
  },
  plugins: [],
}
