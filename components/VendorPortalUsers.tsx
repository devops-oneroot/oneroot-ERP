"use client";

import { KeyRound, Plus, ShieldCheck, UserCheck, UserX } from "lucide-react";
import { useState } from "react";
import { Badge, Button, Card, EmptyRow, ErrorBox, Field, Input, LoadingRow, Modal, Table, Td, Th, errMsg, useConfirm, useToast } from "@/components/ui";
import { api } from "@/lib/api";
import { dateTime } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import type { Vendor } from "@/lib/types";

interface PortalUser {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  lastLoginAt: string | null;
  lockedUntil: string | null;
  createdAt: string;
}

/** Same rule as the API: 10+ characters with a letter and a number */
const PASSWORD_OK = (p: string) => /^(?=.*[A-Za-z])(?=.*\d).{10,128}$/.test(p);
const PASSWORD_HINT = "At least 10 characters, with a letter and a number";

/**
 * Supplier portal sign-ins for one vendor (administrators only). A supplier who signs in sees only the stock of the
 * batches received from this vendor — product, batch, expiry, quantity — and nothing else in the ERP.
 */
export function VendorPortalUsers({ vendor }: { vendor: Vendor }) {
  const toast = useToast();
  const confirm = useConfirm();
  const { data, error, loading, reload } = useApi<PortalUser[]>(`/vendors/${vendor.id}/portal-users`);
  const [adding, setAdding] = useState(false);
  const [resetting, setResetting] = useState<PortalUser | null>(null);

  async function toggle(u: PortalUser) {
    const off = u.isActive;
    if (off && !(await confirm(`Disable ${u.email}? They are signed out at once and can't sign in again until enabled.`, { danger: true, confirmLabel: "Disable" })))
      return;
    try {
      await api.patch(`/vendors/${vendor.id}/portal-users/${u.id}`, { isActive: !off });
      toast.success(off ? `${u.email} disabled` : `${u.email} enabled`);
      await reload();
    } catch (e) {
      toast.error(errMsg(e));
    }
  }

  return (
    <Card
      bodyClassName="p-0"
      title={
        <span className="inline-flex items-center gap-1.5">
          <ShieldCheck className="size-4 text-slate-400" /> Supplier Portal
        </span>
      }
      actions={
        <Button size="sm" variant="add" icon={<Plus className="size-4" />} onClick={() => setAdding(true)}>
          Add Sign-in
        </Button>
      }
    >
      <p className="border-b border-slate-100 px-3 py-2.5 text-xs text-slate-500">
        People from {vendor.name} sign in on the normal sign-in page and see only the stock of batches received from {vendor.name}: product, batch,
        expiry and quantity. No prices, nothing else, view only.
      </p>
      {error ? (
        <div className="p-4">
          <ErrorBox message={error} onRetry={reload} />
        </div>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>Email</Th>
              <Th>Status</Th>
              <Th>Last Sign-in</Th>
              <Th right>Actions</Th>
            </tr>
          </thead>
          <tbody>
            {loading && !data ? (
              <LoadingRow colSpan={5} />
            ) : !data?.length ? (
              <EmptyRow colSpan={5}>No supplier sign-ins yet</EmptyRow>
            ) : (
              data.map((u) => {
                const locked = !!u.lockedUntil && new Date(u.lockedUntil) > new Date();
                return (
                  <tr key={u.id} className="hover:bg-slate-50">
                    <Td className="font-medium text-slate-900">{u.name}</Td>
                    <Td>{u.email}</Td>
                    <Td>
                      {!u.isActive ? <Badge tone="slate">Disabled</Badge> : locked ? <Badge tone="amber">Locked</Badge> : <Badge tone="green">Active</Badge>}
                    </Td>
                    <Td className="whitespace-nowrap text-slate-600">{u.lastLoginAt ? dateTime(u.lastLoginAt) : "Never"}</Td>
                    <Td right className="whitespace-nowrap">
                      <Button size="sm" variant="ghost" icon={<KeyRound className="size-4" />} onClick={() => setResetting(u)}>
                        Reset Password
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={u.isActive ? <UserX className="size-4" /> : <UserCheck className="size-4" />}
                        onClick={() => void toggle(u)}
                      >
                        {u.isActive ? "Disable" : "Enable"}
                      </Button>
                    </Td>
                  </tr>
                );
              })
            )}
          </tbody>
        </Table>
      )}

      <AddSignIn
        open={adding}
        vendor={vendor}
        onClose={() => setAdding(false)}
        onSaved={async () => {
          setAdding(false);
          await reload();
        }}
      />
      <ResetPassword
        user={resetting}
        vendor={vendor}
        onClose={() => setResetting(null)}
        onSaved={async () => {
          setResetting(null);
          await reload();
        }}
      />
    </Card>
  );
}

function AddSignIn({ open, vendor, onClose, onSaved }: { open: boolean; vendor: Vendor; onClose: () => void; onSaved: () => Promise<void> }) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!PASSWORD_OK(password)) return setError(PASSWORD_HINT);
    setBusy(true);
    setError(null);
    try {
      await api.post(`/vendors/${vendor.id}/portal-users`, { name: name.trim(), email: email.trim(), password });
      toast.success(`Sign-in created for ${email.trim()}`);
      setName("");
      setEmail("");
      setPassword("");
      await onSaved();
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={`Supplier sign-in for ${vendor.name}`} size="sm">
      <form onSubmit={save} className="space-y-4">
        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={80} autoFocus />
        </Field>
        <Field label="Email (used to sign in)">
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="off" />
        </Field>
        <Field label="Password" hint={PASSWORD_HINT}>
          <Input isPassword value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="new-password" />
        </Field>
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={busy}>
            Create Sign-in
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function ResetPassword({ user, vendor, onClose, onSaved }: { user: PortalUser | null; vendor: Vendor; onClose: () => void; onSaved: () => Promise<void> }) {
  const toast = useToast();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    if (!PASSWORD_OK(password)) return setError(PASSWORD_HINT);
    setBusy(true);
    setError(null);
    try {
      await api.patch(`/vendors/${vendor.id}/portal-users/${user.id}`, { password });
      toast.success(`Password changed for ${user.email}; their open sessions were signed out`);
      setPassword("");
      await onSaved();
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={!!user} onClose={onClose} title={`New password for ${user?.email ?? ""}`} size="sm">
      <form onSubmit={save} className="space-y-4">
        <Field label="New password" hint={PASSWORD_HINT}>
          <Input isPassword value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="new-password" autoFocus />
        </Field>
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={busy}>
            Set Password
          </Button>
        </div>
      </form>
    </Modal>
  );
}
