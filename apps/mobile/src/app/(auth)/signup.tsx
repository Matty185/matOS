import { useState } from "react";
import {
  Text,
  TextInput,
  View,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Link } from "expo-router";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { signupSchema, type SignupInput } from "@matos/shared";
import { supabase } from "@/lib/supabase";
import { apiPost, type ApiErrorBody } from "@/lib/api";

export default function SignupScreen() {
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [consentChecked, setConsentChecked] = useState(false);
  const {
    control,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<SignupInput>({
    resolver: zodResolver(signupSchema),
    defaultValues: { consent: false as unknown as true },
  });

  async function onSubmit(data: SignupInput) {
    setSubmitError(null);
    const result = await apiPost("/api/signup", data);
    if (!result.ok) {
      setSubmitError((result.error as ApiErrorBody).error ?? "Something went wrong.");
      return;
    }
    const { email } = result.data as { email: string };
    // Same division of responsibility as login.tsx and apps/web's own
    // post-signup flow: the API route only creates the account
    // server-side (service-role, no session yet) — establishing the
    // actual client session, and letting auth-context's listener carry
    // the user into (app), happens here.
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password: data.password,
    });
    if (signInError) setSubmitError("Account created — please sign in.");
  }

  return (
    <SafeAreaView className="flex-1 bg-white">
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1"
      >
        <ScrollView
          contentContainerClassName="justify-center px-6 py-12"
          keyboardShouldPersistTaps="handled"
        >
          <Text className="mb-1 font-heading text-4xl tracking-wide text-primary">MatOS</Text>
          <Text className="mb-6 font-sans text-base text-neutral-600">
            Create your personal workspace — no gym or coach required to get started.
          </Text>

          <View className="flex-row gap-3">
            <View className="flex-1 gap-1.5">
              <Text className="font-sans-bold text-sm text-neutral-900">First name</Text>
              <Controller
                control={control}
                name="firstName"
                render={({ field: { onChange, onBlur, value } }) => (
                  <TextInput
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    autoComplete="name-given"
                    className="h-11 rounded-md border border-neutral-300 px-3 font-sans text-base"
                  />
                )}
              />
              {errors.firstName ? (
                <Text className="font-sans text-sm text-red-600">{errors.firstName.message}</Text>
              ) : null}
            </View>
            <View className="flex-1 gap-1.5">
              <Text className="font-sans-bold text-sm text-neutral-900">Last name</Text>
              <Controller
                control={control}
                name="lastName"
                render={({ field: { onChange, onBlur, value } }) => (
                  <TextInput
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    autoComplete="name-family"
                    className="h-11 rounded-md border border-neutral-300 px-3 font-sans text-base"
                  />
                )}
              />
              {errors.lastName ? (
                <Text className="font-sans text-sm text-red-600">{errors.lastName.message}</Text>
              ) : null}
            </View>
          </View>

          <View className="mt-4 gap-1.5">
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
                  autoComplete="new-password"
                  className="h-11 rounded-md border border-neutral-300 px-3 font-sans text-base"
                />
              )}
            />
            {errors.password ? (
              <Text className="font-sans text-sm text-red-600">{errors.password.message}</Text>
            ) : null}
          </View>

          <View className="mt-4 gap-1.5">
            <Text className="font-sans-bold text-sm text-neutral-900">Confirm password</Text>
            <Controller
              control={control}
              name="confirmPassword"
              render={({ field: { onChange, onBlur, value } }) => (
                <TextInput
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  secureTextEntry
                  autoComplete="new-password"
                  className="h-11 rounded-md border border-neutral-300 px-3 font-sans text-base"
                />
              )}
            />
            {errors.confirmPassword ? (
              <Text className="font-sans text-sm text-red-600">
                {errors.confirmPassword.message}
              </Text>
            ) : null}
          </View>

          <Pressable
            onPress={() => {
              const next = !consentChecked;
              setConsentChecked(next);
              setValue("consent", next as unknown as true, { shouldValidate: true });
            }}
            className="mt-4 flex-row items-start gap-2"
          >
            <View
              className={`mt-0.5 h-5 w-5 items-center justify-center rounded border ${
                consentChecked ? "border-primary bg-primary" : "border-neutral-300"
              }`}
            >
              {consentChecked ? <Text className="text-xs text-white">✓</Text> : null}
            </View>
            <Text className="flex-1 font-sans text-sm text-neutral-600">
              I consent to MatOS storing my analysis and account data as described in the data
              policy.
            </Text>
          </Pressable>
          {errors.consent ? (
            <Text className="mt-1 font-sans text-sm text-red-600">{errors.consent.message}</Text>
          ) : null}

          {submitError ? (
            <Text className="mt-4 font-sans text-sm text-red-600">{submitError}</Text>
          ) : null}

          <Pressable
            onPress={handleSubmit(onSubmit)}
            disabled={isSubmitting}
            className="mt-6 h-11 items-center justify-center rounded-md bg-primary px-4 disabled:opacity-60"
          >
            <Text className="font-sans-bold text-base text-white">
              {isSubmitting ? "Creating your workspace..." : "Create account"}
            </Text>
          </Pressable>

          <View className="mt-4 flex-row items-center justify-center gap-1">
            <Text className="font-sans text-sm text-neutral-600">Already have an account?</Text>
            <Link href="/login" asChild>
              <Pressable className="h-11 items-center justify-center">
                <Text className="font-sans-bold text-sm text-primary">Sign in</Text>
              </Pressable>
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
