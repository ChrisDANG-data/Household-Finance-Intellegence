"use client";

import { Suspense } from "react";

import { LoginForm } from "@/components/auth/LoginForm";

function LoginPageContent() {
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-4 py-12">
      <div className="mb-6 text-center">
        <h1 className="font-serif text-2xl italic">FinIntel</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Sign in with your username and password.
        </p>
      </div>
      <LoginForm variant="card" />
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<p className="p-8 text-center text-muted-foreground">Loading…</p>}>
      <LoginPageContent />
    </Suspense>
  );
}
