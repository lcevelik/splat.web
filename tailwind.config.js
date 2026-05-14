/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                everforest: {
                    bg: {
                        hard: '#272e33',
                        medium: '#2d353b',
                        soft: '#333c43',
                    },
                    fg: '#d3c6aa',
                    red: '#e67e80',
                    orange: '#e69875',
                    yellow: '#dbbc7f',
                    green: '#a7c080',
                    aqua: '#83c092',
                    blue: '#7fbbb3',
                    purple: '#d699b6',
                }
            }
        },
    },
    plugins: [],
}
