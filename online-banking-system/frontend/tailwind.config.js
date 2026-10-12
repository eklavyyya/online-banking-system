/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        navy: {
          DEFAULT: '#1E2761',
          dark: '#141B4D',
          light: '#2E3A8C',
        },
        ice: '#CADCFC',
        gold: {
          DEFAULT: '#D4A537',
          light: '#E8C878',
        },
      },
      fontFamily: {
        serif: ['Georgia', 'Cambria', 'Times New Roman', 'serif'],
      },
    },
  },
  plugins: [],
};
