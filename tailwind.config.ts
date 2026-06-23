import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // small, deliberate palette pulled from the foliage/island
        canopy: "#6fae4f",
        bark: "#5a4633",
        sky: "#cfe6f2",
        accent: "#e0a04a",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
