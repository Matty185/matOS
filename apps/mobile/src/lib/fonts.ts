import { useFonts } from "expo-font";

// Font family names here must match tailwind.config.js's fontFamily
// mapping exactly (`sans: ["Inter"]`, `heading: ["BebasNeue"]`) — NativeWind
// resolves font-family classes to whatever string is registered here.
export function useAppFonts() {
  return useFonts({
    Inter: require("../../assets/fonts/inter-regular.ttf"),
    "Inter-Bold": require("../../assets/fonts/inter-bold.ttf"),
    BebasNeue: require("../../assets/fonts/bebas-neue-regular.ttf"),
  });
}
