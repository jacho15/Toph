"use client";

import { ArrowRightLeft, Check, X } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import clsx from "clsx";
import { switchUser } from "@/app/actions/auth";
import { DEMO_ACCOUNTS } from "@/lib/demo-accounts";

export default function SwitchUserButton({ currentEmail }: { currentEmail?: string }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  function handleSelect(email: string) {
    startTransition(async () => {
      await switchUser(email);
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-[38px] items-center gap-[14px] rounded px-[14px] py-[10px] text-left hover:bg-ink/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/40"
      >
        <ArrowRightLeft className="h-4 w-4 shrink-0 text-text-secondary" strokeWidth={1.33} />
        <span className="text-sm text-ink">Switch User</span>
      </button>

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Switch user"
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4"
          onClick={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <div ref={modalRef} className="w-full max-w-[320px] rounded-[20px] border border-border-subtle bg-paper p-4 shadow-lg">
            <div className="mb-2 flex items-center justify-between px-1">
              <span className="text-sm font-medium text-ink">Switch User</span>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setOpen(false)}
                className="text-text-secondary focus-visible:outline-none"
              >
                <X className="h-4 w-4" strokeWidth={1.33} />
              </button>
            </div>
            <ul className="flex flex-col gap-1">
              {DEMO_ACCOUNTS.map((account) => {
                const isCurrent = account.email === currentEmail;
                return (
                  <li key={account.email}>
                    <button
                      type="button"
                      disabled={pending || isCurrent}
                      onClick={() => handleSelect(account.email)}
                      className={clsx(
                        "flex w-full items-center justify-between rounded px-3 py-2 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/40",
                        isCurrent ? "bg-ink/5 text-ink" : "text-ink hover:bg-ink/[0.03] disabled:opacity-60"
                      )}
                    >
                      <span>
                        {account.label} <span className="text-text-muted">· {account.role}</span>
                      </span>
                      {isCurrent ? <Check className="h-4 w-4 text-ink" strokeWidth={1.33} /> : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      ) : null}
    </>
  );
}
