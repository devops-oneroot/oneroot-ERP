"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, Field, Input, LOGOS, errMsg, Logo } from "@/components/ui";
import { homeFor, useAuth, type DeviceCapture } from "@/lib/auth";

export default function LoginPage() {
  const { login, user, supplier, loading } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Device lock: this device has to be registered (one of the account's 2) before signing in
  const [capture, setCapture] = useState<DeviceCapture | null>(null);
  const [deviceName, setDeviceName] = useState("");

  useEffect(() => {
    if (!loading && (user || supplier)) router.replace(homeFor(supplier));
  }, [loading, user, supplier, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      // Staff go to the ERP, suppliers to their stock page
      const kind = await login(email.trim(), password, capture ? { capture: true, name: deviceName } : undefined);
      if (typeof kind === "object") {
        setCapture(kind.deviceCapture);
        setDeviceName(kind.deviceCapture.suggestedName);
        return;
      }
      router.replace(kind === "vendor" ? "/supplier" : "/dashboard");
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    // Warm light page with soft orange and amber glows; the card's light orange header frames the logo tile
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-gradient-to-br from-paper-4 via-brand-50 to-brand-100 p-4">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -left-32 -top-32 size-[28rem] rounded-full bg-brand-500/25 blur-3xl" />
        <div className="absolute -bottom-40 -right-24 size-[30rem] rounded-full bg-amber-300/30 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(#ff620014_1px,transparent_1px)] [background-size:22px_22px]" />
      </div>
      <form onSubmit={submit} className="relative w-full max-w-sm">
        <div className="overflow-hidden rounded-3xl bg-surface shadow-2xl shadow-brand-900/20 ring-1 ring-forest-900/5">
          <div className="relative overflow-hidden bg-gradient-to-br from-brand-50 via-brand-100 to-brand-200  p-4 pb-1 text-center">
            <div
              aria-hidden
              className="pointer-events-none absolute -right-16 -top-16 size-48 rounded-full bg-brand-400/20 blur-2xl"
            />
            <div
              aria-hidden
              className="pointer-events-none absolute -bottom-20 -left-10 size-44 rounded-full bg-amber-300/15 blur-2xl"
            />
            <Logo logo={LOGOS.vertical} priority framed className="relative px-6 py-3" imageClassName="w-44" />
            <p className="relative text-[11px] font-medium uppercase tracking-[0.18em] text-brand-800 mt-2">
              Agri Inputs ERP
            </p>
          </div>
          <div className="h-1 bg-gradient-to-r from-brand-500 via-brand-400 to-amber-400" />
          <div className="px-5 py-4 sm:px-6">
            <div className="mb-2 text-center">
              <h1 className="text-lg font-semibold text-slate-900">Sign In</h1>
              <p className="text-xs text-slate-500">Use your store or supplier account</p>
            </div>
            <div className="space-y-4">
              <Field label="Email">
                <Input
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                />
              </Field>
              <Field label="Password">
                <Input
                  isPassword
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </Field>
              {/* Hidden for everyone: only an administrator resets or changes passwords (Users → Edit)
              <div className="flex justify-end -mt-2">
                <button
                  type="button"
                  onClick={() => router.push("/forgot-password")}
                  className="py-1 text-xs font-medium text-brand-700 hover:text-brand-900 hover:underline transition-colors"
                >
                  Forgot Password?
                </button>
              </div>
              */}
              {capture && (
                <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
                  <p className="font-medium">Register this device?</p>
                  <p className="text-xs">
                    Your account can be used on only {capture.max} devices. This will be device {capture.slot} of {capture.max} — after that you can sign in only from
                    your registered devices. To change one, ask an administrator.
                  </p>
                  <Field label="Device name">
                    <Input value={deviceName} onChange={(e) => setDeviceName(e.target.value)} placeholder="e.g. POS 2 PC" maxLength={60} />
                  </Field>
                  <button type="button" onClick={() => setCapture(null)} className="text-xs font-medium text-amber-800 hover:underline">
                    Not now
                  </button>
                </div>
              )}
              {error && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                  {error}
                </p>
              )}
              <Button type="submit" loading={busy} className="w-full max-sm:h-10!">
                {capture ? "Register Device & Sign In" : "Sign In"}
              </Button>
            </div>
           
          </div>
          
        </div>
         <p className="mt-6 text-center text-xs text-brand-800/60">
              © {new Date().getFullYear()} OneRoot Agri Inputs
            </p>
      </form>
    </div>
  );
}