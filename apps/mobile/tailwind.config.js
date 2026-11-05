/** @type {import('tailwindcss').Config} */
module.exports = {
  // packages/shared holds BELT_STYLES; Tailwind strips those classes otherwise.
  content: ["./src/**/*.{js,jsx,ts,tsx}", "../../packages/shared/src/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      // Same values as apps/web/tailwind.config.ts's shadcn CSS-variable
      // tokens (--primary: 204.1 61.7% 27.6%, which is #1B4F72) — mobile
      // uses the hex directly rather than mirroring web's CSS-variable
      // indirection, since that mechanism exists there specifically to
      // support runtime CSS theming, which isn't how NativeWind resolves
      // colors on native.
      colors: {
        primary: "#1B4F72",
      },
      fontFamily: {
        // Loaded via expo-font in the root layout — see
        // src/lib/fonts.ts. Same pairing as web: Inter for body copy,
        // Bebas Neue for headings. React Native doesn't synthesize a bold
        // weight from a single regular-weight TTF the way a browser does
        // (font-bold/font-medium/font-semibold only set the `fontWeight`
        // style, which RN ignores once a custom `fontFamily` is set) — the
        // separately-loaded Inter-Bold file has to be selected via its own
        // font-family utility instead.
        sans: ["Inter"],
        "sans-bold": ["Inter-Bold"],
        heading: ["BebasNeue"],
      },
    },
  },
  plugins: [],
};
