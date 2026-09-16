"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from "@/lib/demo-accounts";

const demoEmailSchema = z.enum(DEMO_ACCOUNTS.map((account) => account.email) as [string, ...string[]]);

const signInSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export type SignInState = { ok: true } | { ok: false; error: string };

export async function signIn(_prevState: SignInState | undefined, formData: FormData): Promise<SignInState> {
  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { ok: false, error: "Enter a valid email and password." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    return { ok: false, error: "Invalid email or password." };
  }

  redirect("/dashboard");
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function switchUser(email: string): Promise<void> {
  const parsed = demoEmailSchema.safeParse(email);
  if (!parsed.success) {
    throw new Error("Not a demo account.");
  }

  const supabase = await createClient();
  await supabase.auth.signOut();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data,
    password: DEMO_PASSWORD,
  });

  if (error) {
    throw new Error("Could not switch user.");
  }

  redirect("/dashboard");
}
