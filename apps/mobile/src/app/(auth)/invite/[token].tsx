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
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  claimInviteSchema,
  attachInviteSchema,
  type ClaimInviteInput,
  type AttachInviteInput,
} from "@matos/shared";
import { supabase } from "@/lib/supabase";
import { apiGet, apiPost, type ApiErrorBody } from "@/lib/api";

type InviteInfo = {
  memberFirstName: string | null;
  gymName: string | null;
  accountExists: boolean;
};

// Mirrors apps/web/src/app/invite/[token]/page.tsx's exact two-branch
// design (new account vs. attach — see Stage S2's Decision Log entry for
// why the attach branch verifies a real existing password rather than
// trusting an email match) rather than reimplementing the logic
// differently here; the API contract (GET for info, POST to claim) is
// identical, this is just the RN rendering of the same flow.
export default function InviteClaimScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const router = useRouter();

  const {
    data: invite,
    isLoading,
    error: fetchError,
  } = useQuery<InviteInfo, ApiErrorBody>({
    queryKey: ["invite", token],
    queryFn: async () => {
      const result = await apiGet(`/api/invite/${token}`);
      if (!result.ok) throw result.error;
      return result.data as InviteInfo;
    },
    retry: false,
  });

  async function signInAndEnter(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      router.replace("/login");
      return;
    }
    // No explicit navigation beyond this — auth-context's listener picks
    // up the new session and the (auth) layout's own redirect carries the
    // user into (app), same as login.tsx/signup.tsx.
  }

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-white">
        <Text className="font-sans text-base text-neutral-600">Loading invite...</Text>
      </SafeAreaView>
    );
  }

  if (fetchError) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-white px-6">
        <Text className="mb-2 font-heading text-2xl tracking-wide text-primary">
          Invite unavailable
        </Text>
        <Text className="font-sans text-base text-neutral-600">{fetchError.error}</Text>
      </SafeAreaView>
    );
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
            {invite?.memberFirstName ? `Welcome, ${invite.memberFirstName}. ` : ""}
            {invite?.accountExists
              ? `Confirm you'd like to join${invite?.gymName ? ` ${invite.gymName}` : " this gym"}.`
              : `Set your password to join${invite?.gymName ? ` ${invite.gymName}` : " your gym"}.`}
          </Text>

          {invite?.accountExists ? (
            <AttachForm token={token!} onSuccess={signInAndEnter} />
          ) : (
            <NewAccountForm token={token!} onSuccess={signInAndEnter} />
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function ConsentCheckbox({
  checked,
  onToggle,
  gymName,
}: {
  checked: boolean;
  onToggle: () => void;
  gymName?: string | null;
}) {
  return (
    <Pressable onPress={onToggle} className="mt-4 flex-row items-start gap-2">
      <View
        className={`mt-0.5 h-5 w-5 items-center justify-center rounded border ${
          checked ? "border-primary bg-primary" : "border-neutral-300"
        }`}
      >
        {checked ? <Text className="text-xs text-white">✓</Text> : null}
      </View>
      <Text className="flex-1 font-sans text-sm text-neutral-600">
        I consent to MatOS storing my membership, attendance, and payment data as described in
        {gymName ? ` ${gymName}'s` : " the gym's"} data policy.
      </Text>
    </Pressable>
  );
}

function NewAccountForm({
  token,
  onSuccess,
}: {
  token: string;
  onSuccess: (email: string, password: string) => Promise<void>;
}) {
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [consentChecked, setConsentChecked] = useState(false);
  const {
    control,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<ClaimInviteInput>({
    resolver: zodResolver(claimInviteSchema),
    defaultValues: { consent: false as unknown as true },
  });

  async function onSubmit(data: ClaimInviteInput) {
    setSubmitError(null);
    const result = await apiPost(`/api/invite/${token}/claim`, data);
    if (!result.ok) {
      setSubmitError((result.error as ApiErrorBody).error ?? "Something went wrong.");
      return;
    }
    const { email } = result.data as { email: string };
    await onSuccess(email, data.password);
  }

  return (
    <View>
      <View className="gap-1.5">
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
          <Text className="font-sans text-sm text-red-600">{errors.confirmPassword.message}</Text>
        ) : null}
      </View>

      <ConsentCheckbox
        checked={consentChecked}
        onToggle={() => {
          const next = !consentChecked;
          setConsentChecked(next);
          setValue("consent", next as unknown as true, { shouldValidate: true });
        }}
      />
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
          {isSubmitting ? "Setting up your account..." : "Create account"}
        </Text>
      </Pressable>
    </View>
  );
}

function AttachForm({
  token,
  onSuccess,
}: {
  token: string;
  onSuccess: (email: string, password: string) => Promise<void>;
}) {
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [consentChecked, setConsentChecked] = useState(false);
  const {
    control,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<AttachInviteInput>({
    resolver: zodResolver(attachInviteSchema),
    defaultValues: { consent: false as unknown as true },
  });

  async function onSubmit(data: AttachInviteInput) {
    setSubmitError(null);
    const result = await apiPost(`/api/invite/${token}/claim`, data);
    if (!result.ok) {
      setSubmitError((result.error as ApiErrorBody).error ?? "Something went wrong.");
      return;
    }
    const { email } = result.data as { email: string };
    await onSuccess(email, data.password);
  }

  return (
    <View>
      <Text className="mb-4 font-sans text-sm text-neutral-600">
        This email already has a MatOS account. Enter your password to link this gym to it — your
        existing workspace stays exactly as it is.
      </Text>

      <View className="gap-1.5">
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

      <ConsentCheckbox
        checked={consentChecked}
        onToggle={() => {
          const next = !consentChecked;
          setConsentChecked(next);
          setValue("consent", next as unknown as true, { shouldValidate: true });
        }}
      />
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
          {isSubmitting ? "Linking..." : "Accept invite"}
        </Text>
      </Pressable>
    </View>
  );
}
