/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background: '#020617',
        panel: '#0f172a',
        primary: '#38bdf8',
        accent: '#818cf8',
        success: '#34d399',
        warning: '#f59e0b',
        danger: '#fb7185',
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(56,189,248,0.25), 0 12px 40px rgba(56,189,248,0.16)',
      },
    },
  },
  plugins: [],
};
