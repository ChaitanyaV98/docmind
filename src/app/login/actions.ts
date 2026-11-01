"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createSession, deleteSession } from "@/lib/session";
import { authenticate } from "@/lib/users";

const LoginSchema = z.object({
  email: z.email("Enter a valid email"),
  password: z.string().min(1, "Enter your password"),
});

export interface LoginState {
  error?: string;
  email?: string;
}

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = LoginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  const email = String(formData.get("email") ?? "");
  if (!parsed.success) return { error: parsed.error.issues[0].message, email };

  const user = await authenticate(parsed.data.email, parsed.data.password);
  // One message for both cases, so the form can't be used to discover which emails exist.
  if (!user) return { error: "Incorrect email or password", email };

  await createSession({ userId: user.id, email: user.email, name: user.name });
  redirect("/"); // throws — must stay outside any try/catch
}

export async function logout() {
  await deleteSession();
  redirect("/login");
}
