/// <reference types="nativewind/types" />

// The nativewind/types reference above augments react-native's own
// module identity as resolved from nativewind's *own* nested
// node_modules (npm doesn't collapse it into ours due to a
// react-native-reanimated version mismatch several layers down), so
// TypeScript treats that as a different module than the react-native
// our app code actually imports and it doesn't take effect. This
// duplicates the specific props MatOS's screens use, augmented from
// our own module resolution instead.
import "react-native";

declare module "react-native" {
  interface ViewProps {
    className?: string;
  }
  interface TextProps {
    className?: string;
  }
  interface TextInputProps {
    className?: string;
  }
  interface PressableProps {
    className?: string;
  }
  interface ScrollViewProps {
    className?: string;
    contentContainerClassName?: string;
  }
  interface KeyboardAvoidingViewProps {
    className?: string;
  }
}
