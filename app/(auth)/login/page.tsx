"use client";

import { AudioLines, LogIn, UserStar } from "lucide-react";
import { useActionState, useState } from "react";
import { signIn } from "@/app/actions/auth";
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from "@/lib/demo-accounts";

export default function LoginPage() {
  const [state, action, pending] = useActionState(signIn, undefined);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  function fillDemoAccount(demoEmail: string) {
    setEmail(demoEmail);
    setPassword(DEMO_PASSWORD);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper p-[10px]">
      <div className="w-full max-w-[400px] rounded-[20px] border border-border-subtle p-8">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-ink">
              <AudioLines className="h-5 w-5 text-paper" strokeWidth={1.33} />
            </div>
            <h1 className="text-lg font-semibold leading-[26px] text-ink">Toph</h1>
          </div>
          <p className="text-base leading-[20.8px] text-text-secondary">Sign in to your farm dashboard</p>
        </div>

        <form action={action} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="email" className="text-sm text-text-secondary">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="h-[42px] rounded-[7.04px] border border-border-default bg-paper px-3 text-sm text-ink placeholder:text-text-placeholder focus:outline-none focus:ring-2 focus:ring-ink/40"
              placeholder="you@farm.test"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="password" className="text-sm text-text-secondary">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="h-[42px] rounded-[7.04px] border border-border-default bg-paper px-3 text-sm text-ink placeholder:text-text-placeholder focus:outline-none focus:ring-2 focus:ring-ink/40"
              placeholder="••••••••"
            />
          </div>

          {state && !state.ok ? <p className="text-sm text-red-600">{state.error}</p> : null}

          <button
            type="submit"
            disabled={pending}
            className="mt-2 flex h-[42px] items-center justify-center gap-2 rounded-[7.04px] bg-ink text-base text-paper disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/40"
          >
            <LogIn className="h-4 w-4" strokeWidth={1.33} />
            <span>{pending ? "Signing in…" : "Sign In"}</span>
          </button>
        </form>

        <div className="mt-8 flex flex-col gap-2">
          <p className="text-2xs font-medium text-text-faint">DEMO ACCOUNTS</p>
          <ul className="flex flex-col gap-1">
            {DEMO_ACCOUNTS.map((account) => (
              <li key={account.email}>
                <button
                  type="button"
                  onClick={() => fillDemoAccount(account.email)}
                  className="flex w-full items-center justify-between rounded px-3 py-2 text-left hover:bg-ink/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/40"
                >
                  <span className="text-sm text-ink">{account.label}</span>
                  <span className="flex items-center gap-1 text-sm text-text-muted">
                    <UserStar className="h-[10px] w-[10px]" strokeWidth={1.33} />
                    {account.role}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
