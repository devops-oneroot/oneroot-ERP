"use client";

import { KeyRound, LogOut } from "lucide-react";
import { useState } from "react";
import { NoAccess } from "@/components/AppShell";
import { Button, Card, Field, Info, Input, PageHeader, StatusBadge, useToast } from "@/components/ui";
import { changePassword, useAuth } from "@/lib/auth";
import type { Role } from "@/lib/types";

const ROLE_INFO: Record<Role, string> = {
  ADMIN: "Full access, including users, store settings and the audit log.",
  MANAGER: "Inventory, purchases, reports and cancellations.",
  CASHIER: "Billing, customers and receipts.",
  ACCOUNTANT: "Purchases, payments, expenses and reports.",
};

export default function AccountPage() {
  const { user, logout, isAdmin } = useAuth();
  const toast = useToast();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const tooShort = next.length > 0 && next.length < 6;
  const mismatch = confirm.length > 0 && next !== confirm;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (next.length < 6) return setError("New password must be at least 6 characters");
    if (next !== confirm) return setError("New passwords don't match");
    if (next === current) return setError("New password must be different from the current one");
    setSaving(true);
    try {
      await changePassword(current, next);
      setCurrent("");
      setNext("");
      setConfirm("");
      toast.success("Password changed");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not change password");
    } finally {
      setSaving(false);
    }
  }

  if (!user) return null;
  // My Account and Change Password are for administrators only
  if (!isAdmin) return <NoAccess />;


return (
  <>
    <PageHeader
      title="My Account"
      actions={
        <Button
          variant="secondary"
          icon={<LogOut className="size-4" />}
          onClick={logout}
        >
          Sign Out
        </Button>
      }
    />

    <div className="mx-auto w-full max-w-6xl flex-1 space-y-6">
      {/* Page introduction */}
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-5 sm:p-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
            <KeyRound className="size-7" />
          </div>

          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
              Account settings
            </h2>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              Manage your profile and keep your account secure.
            </p>
          </div>

          {/* Keeps the badge its own width when the row stacks on phones */}
          <div className="flex self-start sm:self-auto">
            <StatusBadge status={user.role} />
          </div>
        </div>
      </div>

      {/* Responsive cards */}
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2 lg:gap-6">
        {/* Profile */}
        <Card title="Profile">
          <div className="space-y-5">
            <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-4">
              <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-lg font-semibold text-indigo-700">
                {user.name?.trim()?.charAt(0)?.toUpperCase() || "U"}
              </div>
              <div className="min-w-0">
                <p className="truncate font-semibold text-slate-900">
                  {user.name}
                </p>
                <p className="break-all text-sm text-slate-500">
                  {user.email}
                </p>
              </div>
            </div>

            <dl className="divide-y divide-slate-100">
              <div className="py-4">
                <Info label="Full Name">{user.name}</Info>
              </div>

              <div className="py-4">
                <Info label="Email Address">
                  <span className="break-all">{user.email}</span>
                </Info>
              </div>

              <div className="py-4">
                <Info label="Role">
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <StatusBadge status={user.role} />
                    {user.roleTemplate && (
                      <span className="text-sm font-medium text-slate-700">
                        {user.roleTemplate.name}
                      </span>
                    )}
                  </div>
                  <p className="mt-2 text-sm leading-5 text-slate-500">
                    {ROLE_INFO[user.role]}
                  </p>
                </Info>
              </div>
            </dl>

            <div className="flex items-start gap-2 rounded-xl border border-slate-200 p-3">
              <KeyRound className="mt-0.5 size-4 shrink-0 text-slate-400" />
              <p className="text-xs leading-5 text-slate-500">
                Contact an administrator to update your name, phone number,
                or role.
              </p>
            </div>
          </div>
        </Card>

        {/* Password */}
        <Card title="Change Password">
          <form onSubmit={submit} className="space-y-5">
            <p className="text-sm leading-6 text-slate-500">
              Choose a new password to keep your account protected.
            </p>

            <Field label="Current Password" required>
              <Input
                isPassword
                autoComplete="current-password"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                required
              />
            </Field>

            <Field
              label="New Password"
              required
              hint="At least 6 characters"
            >
              <Input
                isPassword
                autoComplete="new-password"
                value={next}
                onChange={(e) => setNext(e.target.value)}
                className={tooShort ? "border-red-400" : undefined}
                required
                minLength={6}
              />
              {tooShort && (
                <p className="mt-1 text-xs text-red-600">
                  Password must be at least 6 characters.
                </p>
              )}
            </Field>

            <Field label="Confirm New Password" required>
              <Input
                isPassword
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className={mismatch ? "border-red-400" : undefined}
                required
              />
              {mismatch && (
                <p className="mt-1 text-xs text-red-600">
                  Passwords do not match.
                </p>
              )}
            </Field>

            {error && (
              <div
                role="alert"
                className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"
              >
                {error}
              </div>
            )}

            <div className="border-t border-slate-100 pt-4">
              <Button
                type="submit"
                loading={saving}
                icon={<KeyRound className="size-4" />}
                disabled={
                  saving ||
                  !current ||
                  !next ||
                  !confirm ||
                  tooShort ||
                  mismatch
                }
                className="w-full"
              >
                Update Password
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  </>
);
}
