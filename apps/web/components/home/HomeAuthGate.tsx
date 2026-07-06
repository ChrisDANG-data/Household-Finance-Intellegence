"use client";

import { useEffect, useState } from "react";

import { LoginForm } from "@/components/auth/LoginForm";
import { AUTH_SESSION_CHANGED_EVENT } from "@/lib/auth/auth-events";

type SessionState = {
  authEnabled: boolean;
  authenticated: boolean;
  user: { id: string; username: string } | null;
  registrationAllowed: boolean;
  hasUsers: boolean;
};

export function HomeAuthGate({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<SessionState | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadSession() {
      try {
        const response = await fetch("/api/auth/session", { cache: "no-store" });
        const payload = (await response.json()) as {
          success?: boolean;
          data?: SessionState;
        };
        if (!cancelled && payload.success && payload.data) {
          setSession(payload.data);
        }
      } catch {
        if (!cancelled) {
          setSession({
            authEnabled: false,
            authenticated: true,
            user: null,
            registrationAllowed: false,
            hasUsers: true,
          });
        }
      }
    }

    void loadSession();

    function onSessionChanged() {
      void loadSession();
    }

    window.addEventListener(AUTH_SESSION_CHANGED_EVENT, onSessionChanged);
    return () => {
      cancelled = true;
      window.removeEventListener(AUTH_SESSION_CHANGED_EVENT, onSessionChanged);
    };
  }, []);

  if (!session) {
    return (
      <div className="fi-home-page flex min-h-[60vh] items-center justify-center text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (!session.authEnabled || session.authenticated) {
    return <>{children}</>;
  }

  return (
    <div className="fi-home-page">
      <section className="fi-cloudme-hero relative flex min-h-[85vh] items-center overflow-hidden pb-20 pt-28">
        <div className="pointer-events-none absolute -left-16 top-20 size-56 rounded-full bg-white/10 blur-2xl" />
        <div className="pointer-events-none absolute right-0 top-10 size-72 rounded-full bg-emerald-300/20 blur-3xl" />

        <div className="relative z-10 mx-auto w-full max-w-6xl px-4 sm:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-white/80">
              Household Financial Intelligence
            </p>
            <h1 className="text-3xl font-bold text-white sm:text-4xl">
              Sign in to manage your finances
            </h1>
            <p className="mt-3 text-sm text-white/75 sm:text-base">
              Your ledger, documents, and forecasts are protected. Use the account
              stored in our database.
            </p>
          </div>

          <div className="mt-8">
            <LoginForm
              showRegister={session.registrationAllowed}
              defaultMode={session.hasUsers ? "signin" : "register"}
            />
          </div>
        </div>
      </section>
    </div>
  );
}
