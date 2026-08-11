/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#0c1210',
          900: '#121a17',
          800: '#1a2621',
          700: '#24332c',
        },
        leaf: {
          300: '#9fd6b0',
          400: '#6fbf88',
          500: '#3f9a5c',
          600: '#2f7a48',
        },
        sun: {
          300: '#ffe08a',
          400: '#ffc94a',
          500: '#f0a820',
        },
        mist: {
          100: '#eef6f1',
          200: '#d7e8de',
        },
      },
      fontFamily: {
        display: ['"Fraunces"', 'Georgia', 'serif'],
        sans: ['"Nunito"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        studio: '0 18px 50px rgba(12, 18, 16, 0.28)',
      },
      backgroundImage: {
        'studio-glow':
          'radial-gradient(ellipse at 20% 0%, rgba(111,191,136,0.22), transparent 50%), radial-gradient(ellipse at 90% 10%, rgba(240,168,32,0.16), transparent 45%), linear-gradient(160deg, #0c1210 0%, #16221c 45%, #1a2621 100%)',
      },
    },
  },
  plugins: [],
};
