"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogIn, LogOut } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import {
  AUTH_SESSION_CHANGED_EVENT,
  notifyAuthSessionChanged,
} from "@/lib/auth/auth-events";
import { cn } from "@/lib/utils";

type SessionState = {
  authEnabled: boolean;
  authenticated: boolean;
  user: { id: string; username: string } | null;
};

async function fetchSessionState(): Promise<SessionState | null> {
  const response = await fetch("/api/auth/session", { cache: "no-store" });
  const payload = (await response.json()) as {
    success?: boolean;
    data?: SessionState;
  };
  if (payload.success && payload.data) {
    return payload.data;
  }
  return null;
}

export function AuthNavActions({ onHero }: { onHero: boolean }) {
  const router = useRouter();
  const [session, setSession] = useState<SessionState | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  const loadSession = useCallback(async () => {
    try {
      const data = await fetchSessionState();
      if (data) setSession(data);
    } catch {
      setSession({ authEnabled: false, authenticated: false, user: null });
    }
  }, []);

  useEffect(() => {
    void loadSession();

    function onSessionChanged() {
      void loadSession();
    }

    window.addEventListener(AUTH_SESSION_CHANGED_EVENT, onSessionChanged);
    return () => {
      window.removeEventListener(AUTH_SESSION_CHANGED_EVENT, onSessionChanged);
    };
  }, [loadSession]);

  const signOut = useCallback(async () => {
    setSigningOut(true);
    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "same-origin",
      });
      if (!response.ok) return;

      setSession((prev) =>
        prev
          ? { ...prev, authenticated: false, user: null }
          : { authEnabled: true, authenticated: false, user: null },
      );
      notifyAuthSessionChanged();
      router.replace("/");
      router.refresh();
    } finally {
      setSigningOut(false);
    }
  }, [router]);

  if (!session?.authEnabled) {
    return null;
  }

  const buttonClass = cn(
    "inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium transition-colors",
    onHero
      ? "text-white/90 hover:bg-white/12 hover:text-white"
      : "text-muted-foreground hover:bg-emerald-500/10 hover:text-foreground",
  );

  if (!session.authenticated) {
    return (
      <Link href="/" className={buttonClass}>
        <LogIn className="size-3.5" />
        <span className="hidden sm:inline">Sign in</span>
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span
        className={cn(
          "hidden text-xs font-medium sm:inline",
          onHero ? "text-white/75" : "text-muted-foreground",
        )}
      >
        {session.user?.username}
      </span>
      <button
        type="button"
        className={buttonClass}
        onClick={() => void signOut()}
        disabled={signingOut}
      >
        <LogOut className="size-3.5" />
        <span className="hidden sm:inline">{signingOut ? "Signing out…" : "Sign out"}</span>
      </button>
    </div>
  );
}
