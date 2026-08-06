import { useState } from "react";
import { Text, TextInput, View, Pressable, KeyboardAvoidingView, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Link } from "expo-router";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { loginSchema, type LoginInput } from "@matos/shared";
import { supabase } from "@/lib/supabase";

export default function LoginScreen() {
  const [formError, setFormError] = useState<string | null>(null);
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  async function onSubmit(data: LoginInput) {
    setFormError(null);
    // No API call, no session-establishing redirect logic needed —
    // signInWithPassword's own session is picked up by auth-context's
    // onAuthStateChange listener, which is what actually moves the user
    // into (app) via the (auth) layout's redirect. Same division of
    // responsibility as apps/web's login page (client-side
    // signInWithPassword, then let the surrounding auth state drive
    // navigation) — mirrored here rather than reinvented.
    const { error } = await supabase.auth.signInWithPassword(data);
    if (error) setFormError("Incorrect email or password.");
  }

  return (
    <SafeAreaView className="flex-1 bg-white">
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1 justify-center px-6"
      >
        <Text className="mb-1 font-heading text-4xl tracking-wide text-primary">MatOS</Text>
        <Text className="mb-6 font-sans text-base text-neutral-600">Sign in to your account</Text>

        <View className="gap-1.5">
          <Text className="font-sans-bold text-sm text-neutral-900">Email</Text>
          <Controller
            control={control}
            name="email"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextInput
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                className="h-11 rounded-md border border-neutral-300 px-3 font-sans text-base"
              />
            )}
          />
          {errors.email ? (
            <Text className="font-sans text-sm text-red-600">{errors.email.message}</Text>
          ) : null}
        </View>

        <View className="mt-4 gap-1.5">
          <Text className="font-sans-bold text-sm text-neutral-900">Password</Text>
          <Controller
            control={control}
            name="password"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextInput
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                secureTextEntry
                autoComplete="current-password"
                className="h-11 rounded-md border border-neutral-300 px-3 font-sans text-base"
              />
            )}
          />
          {errors.password ? (
            <Text className="font-sans text-sm text-red-600">{errors.password.message}</Text>
          ) : null}
        </View>

        {formError ? (
          <Text className="mt-4 font-sans text-sm text-red-600">{formError}</Text>
        ) : null}

        <Pressable
          onPress={handleSubmit(onSubmit)}
          disabled={isSubmitting}
          className="mt-6 h-11 items-center justify-center rounded-md bg-primary px-4 disabled:opacity-60"
        >
          <Text className="font-sans-bold text-base text-white">
            {isSubmitting ? "Signing in..." : "Sign in"}
          </Text>
        </Pressable>

        <View className="mt-4 flex-row items-center justify-center gap-1">
          <Text className="font-sans text-sm text-neutral-600">No gym yet?</Text>
          <Link href="/signup" asChild>
            <Pressable className="h-11 items-center justify-center">
              <Text className="font-sans-bold text-sm text-primary">Create a workspace</Text>
            </Pressable>
          </Link>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
