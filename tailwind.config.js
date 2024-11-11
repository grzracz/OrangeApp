/** @type {import('tailwindcss').Config} */
export default {
    content: ['./src/**/*.{js,ts,jsx,tsx}'],
    theme: {
        extend: {},
        gridTemplateColumns: {
            16: 'repeat(16, minmax(0, 1fr))',
        },
    },
    plugins: [],
};
