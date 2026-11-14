"use client";

import { Plus } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { RequirePerm } from "@/components/AppShell";
import { BranchCode, useBranchOptions } from "@/components/BranchNotice";
// import { DepartmentsPanel } from "@/components/DepartmentsPanel"; // panel hidden from the User tab
import { DepartmentsTab } from "@/components/admin/DepartmentsTab";
import { RolesTab } from "@/components/admin/RolesTab";
import { PermissionPicker, useCanGrantAll } from "@/components/PermissionPicker";
import { RoleTemplateForm } from "@/components/RoleTemplateForm";
import {
  ActionsTd,
  ActionsTh,
  Badge,
  Button,
  Card,
  Dropdown,
  EmptyRow,
  ErrorBox,
  Field,
  Input,
  LoadingRow,
  Modal,
  PageHeader,
  RowAction,
  Select,
  StatusBadge,
  Table,
  Tabs,
  Td,
  Th,
  cx,
  errMsg,
  useConfirm,
  useToast,
} from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { dateTime } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import { PERMISSIONS, defaultsFor, normalizePermissions, type Permission } from "@/lib/permissions";
import { ROLES, type BuiltInRole, type Department, type Role, type RoleTemplate, type User } from "@/lib/types";

const ROLE_INFO: Record<Role, string> = {
  ADMIN: "Everything, always — including users, store settings and the audit log",
  MANAGER: "Inventory, Purchases, Reports, Approvals and Cancellations",
  CASHIER: "Billing, Customers and Receipts",
  ACCOUNTANT: "Purchases, Payments, Expenses, Accounts and Reports",
};

/** A built-in role's permissions as set in Roles & Limits (the shipped defaults until they load) */
function rolePerms(role: Role, builtIns: BuiltInRole[]): Permission[] {
  const r = builtIns.find((b) => b.role === role);
  return r ? normalizePermissions(r.permissions) : defaultsFor(role);
}

const roleName = (r: Role) => r.charAt(0) + r.slice(1).toLowerCase();

export default function UsersPage() {
  return (
    <RequirePerm perms={["admin.users"]}>
      <Users />
    </RequirePerm>
  );
}

function Users() {
  const { user: me, can, isAdmin } = useAuth();
  const { data, error, loading, reload } = useApi<User[]>("/users");
  const templates = useApi<RoleTemplate[]>("/roles/custom");
  const builtIns = useApi<BuiltInRole[]>("/roles/built-in");
  const departments = useApi<Department[]>("/departments");
  // Codes of all branches, to show a user's several branches in the list
  const { branches: branchList } = useBranchOptions();
  const branchCodes = new Map(branchList.map((b) => [b.id, b.code]));
  // "" = everyone, "none" = users on a built-in role, otherwise a department id
  const [deptFilter, setDeptFilter] = useState("");
  const [editing, setEditing] = useState<User | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [roleForm, setRoleForm] = useState<{ template: RoleTemplate | null; departmentId: string | null } | null>(null);
  type Filter = "department" | "role" | "user";
  // The tab is kept in the address (?tab=department|role|user), so the old Departments / Roles links land on theirs
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const canRoles = can("admin.roles");
  const wanted = params.get("tab");
  const filter: Filter = wanted === "department" || (wanted === "role" && canRoles) ? wanted : "user";
  // The page's add button for the Department / Role tab was pressed
  const [adding, setAdding] = useState(false);
  const setFilter = (t: Filter) => {
    setAdding(false);
    router.replace(t === "user" ? pathname : `${pathname}?tab=${t}`, { scroll: false });
  };

  // Never read: nothing opens a picker, and the user list isn't paged
  // const [picking, setPicking] = useState(false);
  // const [page, setPage] = useState(1);

  const toast = useToast();
  const confirm = useConfirm();
  async function removeUser(u: User) {
    if (!(await confirm(`Delete ${u.name}? If they have already used the ERP they are made inactive instead, so their history keeps their name.`, { danger: true, confirmLabel: "Delete" })))
      return;
    try {
      const r = await api.del<{ deleted: boolean }>(`/users/${u.id}`);
      toast.success(r.deleted ? `${u.name} deleted` : `${u.name} made inactive (they have history) — they can no longer sign in`);
      void reload();
    } catch (e) {
      toast.error(errMsg(e));
    }
  }

  const open = (u: User | null) => {
    setEditing(u);
    setFormOpen(true);
  };

  const rows = (data ?? []).filter((u) => {
    const dept = u.roleTemplate?.department?.id;
    return !deptFilter || (deptFilter === "none" ? !dept : dept === deptFilter);
  });

  return (
    <>
      <PageHeader
        title="Users"
        subtitle="Staff who can sign in, what each of them may do, and which branch they work in"
        actions={
          // One add button, in the same place, for whichever tab is open
          filter === "department" ? (
            can("roles.create") && (
              <Button variant="add" icon={<Plus className="size-4" />} onClick={() => setAdding(true)}>
                New Department
              </Button>
            )
          ) : filter === "role" ? (
            can("roles.create") && (
              <Button variant="add" icon={<Plus className="size-4" />} onClick={() => setAdding(true)}>
                New Role
              </Button>
            )
          ) : (
            can("users.create") && (
              <Button variant="add" icon={<Plus className="size-4" />} onClick={() => open(null)}>
                New User
              </Button>
            )
          )
        }
      />

        <div className="px-3 pt-2">
          <Tabs<Filter>
            value={filter}
            onChange={(v) => {
              setFilter(v);
              // setPage(1);
            }}
            tabs={[
              { value: "department", label: "Department" },
              ...(canRoles ? [{ value: "role" as Filter, label: "Role" }] : []),
              { value: "user", label: "User" },
            ]}
          />
        </div>

      {filter === "department" && <DepartmentsTab adding={adding} onAddDone={() => setAdding(false)} />}
      {filter === "role" && <RolesTab adding={adding} onAddDone={() => setAdding(false)} />}

      {filter === "user" && (
      <>
      <Card bodyClassName="p-0">
        <div className="border-b border-slate-100 p-3">
          <Select value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)} className="w-full sm:w-64" aria-label="Department">
            <option value="">All Departments</option>
            {(departments.data ?? []).map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} ({d.code})
              </option>
            ))}
            <option value="none">No Department</option>
          </Select>
        </div>
        {error ? (
          <div className="p-4">
            <ErrorBox message={error} onRetry={reload} />
          </div>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Designation</Th>
                <Th>Department</Th>
                <Th>Role</Th>
                <Th>Access</Th>
                <Th>Branch</Th>
                <Th className="hidden md:table-cell">Phone</Th>
                <Th className="hidden md:table-cell">Last Sign-In</Th>
                <Th>Status</Th>
                <ActionsTh />
              </tr>
            </thead>
            <tbody>
              {loading && !data ? (
                <LoadingRow colSpan={10} />
              ) : !rows.length ? (
                <EmptyRow colSpan={10}>{deptFilter ? "No users in this department" : "No users"}</EmptyRow>
              ) : (
                rows.map((u) => (
                  <tr key={u.id} className={cx("hover:bg-slate-50", !u.isActive && "text-slate-400")}>
                    <Td>
                      <span className={cx("font-medium", u.isActive ? "text-slate-900" : "text-slate-500")}>{u.name}</span>
                      {u.id === me?.id && (
                        <span className="ml-1.5">
                          <Badge tone="blue">You</Badge>
                        </span>
                      )}
                      <p className="text-xs text-slate-500">{u.email}</p>
                    </Td>
                    <Td className="text-sm">{u.designation || <span className="text-xs text-slate-400">—</span>}</Td>
                    <Td>
                      {u.roleTemplate?.department ? (
                        <>
                          <span className="text-sm font-medium text-slate-800">{u.roleTemplate.department.name}</span>
                          {u.roleTemplate.department.code && <p className="font-mono text-xs text-slate-500">{u.roleTemplate.department.code}</p>}
                        </>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </Td>
                    <Td>
                      {u.roleTemplate ? (
                        <>
                          <span className="text-sm font-medium text-slate-800">{u.roleTemplate.name}</span>
                          <p className="text-xs text-slate-500">Limits of {roleName(u.roleTemplate.baseRole ?? u.role)}</p>
                        </>
                      ) : (
                        <StatusBadge status={u.role} />
                      )}
                    </Td>
                    <Td>
                      <AccessSummary user={u} />
                    </Td>
                    <Td className="whitespace-nowrap">
                      {(u.branchIds?.length ?? 0) > 1 ? (
                        <span className="inline-flex flex-wrap items-center gap-1" title={`${u.branchIds!.length} branches`}>
                          {u.branchIds!.map((id) => (
                            <BranchCode key={id} code={branchCodes.get(id) ?? "?"} />
                          ))}
                        </span>
                      ) : u.branch ? (
                        <span className="inline-flex items-center gap-1.5">
                          <BranchCode code={u.branch.code} />
                          <span className="text-sm">{u.branch.name}</span>
                        </span>
                      ) : (
                        <span className="text-xs text-slate-500">All branches</span>
                      )}
                    </Td>
                    <Td className="hidden md:table-cell">{u.phone || "—"}</Td>
                    <Td className="hidden text-xs md:table-cell">{u.lastLoginAt ? dateTime(u.lastLoginAt) : "Never"}</Td>
                    <Td>{u.isActive ? <Badge tone="green">Active</Badge> : <Badge>Inactive</Badge>}</Td>
                    <ActionsTd>
                      {/* Only an administrator can edit an administrator */}
                      {can("users.edit") && (isAdmin || u.role !== "ADMIN") && <RowAction kind="edit" title={`Edit ${u.name}`} onClick={() => open(u)} />}
                      {can("users.delete") && u.id !== me?.id && (isAdmin || u.role !== "ADMIN") && (
                        <RowAction kind="delete" title={`Delete ${u.name}`} onClick={() => void removeUser(u)} />
                      )}
                    </ActionsTd>
                  </tr>
                ))
              )}
            </tbody>
          </Table>
        )}
      </Card>

      {/* Departments and their roles are managed on the Department and Role tabs now
      <DepartmentsPanel
        templates={templates.data ?? []}
        canCreate={can("roles.create")}
        canEdit={can("roles.edit")}
        canDelete={can("roles.delete")}
        onNewRole={(departmentId) => setRoleForm({ template: null, departmentId })}
        onEditRole={(t) => setRoleForm({ template: t, departmentId: t.departmentId ?? null })}
        onChanged={() => void templates.reload()}
      />
      */}

      <Card title="Roles & Permissions" className="mt-4">
        <dl className="grid gap-3 sm:grid-cols-2">
          {ROLES.map((r) => (
            <div key={r} className="flex items-start gap-2">
              <StatusBadge status={r} />
              <dd className="text-sm text-slate-600">{ROLE_INFO[r]}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 border-t border-slate-100 pt-3 text-sm text-slate-600">
          <b className="font-medium text-slate-800">Permissions:</b> every user gets a department and a role inside it, and that role alone
          decides what they can open — the sidebar, the pages and the API all follow it. Edit a role and everyone on it follows; there are
          no per-person extras. Administrators are the only users outside a department. Discount, refund and adjustment ceilings come from
          the limits of the built-in role each role is based on (Roles &amp; Limits).
        </p>
        <p className="mt-2 text-sm text-slate-600">
          <b className="font-medium text-slate-800">Home branch:</b> staff with a home branch are locked to it — they only see and
          record that branch&apos;s stock, sales and purchases. Leave it as &ldquo;All branches&rdquo; for owners and administrators who
          switch between branches from the top bar (an administrator&apos;s home branch is just the one selected when they sign in).
        </p>
      </Card>
      </>
      )}

      {formOpen && (
        <UserForm
          user={editing}
          isSelf={!!editing && editing.id === me?.id}
          templates={templates.data ?? []}
          builtIns={builtIns.data ?? []}
          onTemplatesChanged={() => void templates.reload()}
          onClose={() => setFormOpen(false)}
          onSaved={() => {
            setFormOpen(false);
            void reload();
            void templates.reload();
          }}
        />
      )}
      {roleForm && (
        <RoleTemplateForm
          template={roleForm.template}
          initialDepartmentId={roleForm.departmentId}
          onClose={() => setRoleForm(null)}
          onSaved={() => {
            setRoleForm(null);
            void templates.reload();
          }}
        />
      )}
    </>
  );
}

/** Access comes only from the user's department role: "Everything" for administrators, else how many permissions it gives */
function AccessSummary({ user }: { user: User }) {
  if (user.role === "ADMIN") return <span className="text-xs text-slate-500">Everything</span>;
  if (!user.roleTemplate) return <Badge tone="amber">Needs a Department Role</Badge>;
  return (
    <span className="num text-xs text-slate-500">
      {normalizePermissions(user.permissions ?? []).length} of {PERMISSIONS.length} from role
    </span>
  );
}

/**
 * Department first, then one of the roles inside it: that role alone decides what the user may do.
 * Administrator is the only access outside a department (only an administrator can give it).
 */
function DepartmentRolePicker({
  role,
  templateId,
  departmentId,
  templates,
  onDepartment,
  onPick,
  onNewRole,
  disabled,
}: {
  role: Role;
  templateId: string | null;
  /** "" = not chosen yet, "admin" = Administrator, otherwise a department id */
  departmentId: string;
  templates: RoleTemplate[];
  onDepartment: (departmentId: string) => void;
  onPick: (role: Role, template: RoleTemplate | null) => void;
  onNewRole?: () => void;
  disabled?: boolean;
}) {
  const { isAdmin } = useAuth();
  const departments = useApi<Department[]>("/departments");
  const inDepartment = templates.filter((t) => (t.departmentId ?? "") === departmentId);
  const department = departments.data?.find((d) => d.id === departmentId);
  const template = inDepartment.find((t) => t.id === templateId);
  const inDept = !!departmentId && departmentId !== "admin";
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Department" required>
        <Select value={departmentId} onChange={(e) => onDepartment(e.target.value)} disabled={disabled}>
          <option value="">{departments.loading ? "Loading Departments…" : "Choose a Department"}</option>
          {(departments.data ?? []).map((d) => (
            <option key={d.id} value={d.id}>
              {d.name} ({d.code})
            </option>
          ))}
          {/* Only an administrator can make another administrator */}
          {(isAdmin || role === "ADMIN") && <option value="admin">None — Administrator (Full Access)</option>}
        </Select>
      </Field>
      {inDept ? (
        <Field label="Role" required hint={template?.description || (template ? `${template.permissions.length} permissions` : undefined)}>
          <Select
            value={templateId ?? ""}
            onChange={(e) => {
              const t = inDepartment.find((x) => x.id === e.target.value);
              if (t) onPick(t.baseRole, t);
            }}
            disabled={disabled || !inDepartment.length}
          >
            <option value="">{inDepartment.length ? "Choose a Role" : "No Roles in This Department Yet"}</option>
            {inDepartment.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        </Field>
      ) : departmentId === "admin" ? (
        <p className="self-end pb-2 text-xs text-slate-500">{ROLE_INFO.ADMIN}</p>
      ) : (
        <div className="hidden sm:block" />
      )}
      {onNewRole && !disabled && inDept && (
        <button
          type="button"
          onClick={onNewRole}
          className="rounded-lg border border-dashed border-slate-300 px-3 py-2 text-left text-sm font-medium text-brand-700 hover:bg-slate-50 sm:col-span-2"
        >
          <span className="inline-flex items-center gap-1">
            <Plus className="size-4" /> New Role in {department?.name ?? "This Department"}…
          </span>
          <p className="text-xs font-normal text-slate-500">e.g. Procurement → Category Head</p>
        </button>
      )}
    </div>
  );
}

/** The "All Branches" row of the user's Branches dropdown (stands for an empty branch list) */
const ALL_BRANCHES = "__all";

function UserForm({
  user,
  isSelf,
  templates: loadedTemplates,
  builtIns,
  onTemplatesChanged,
  onClose,
  onSaved,
}: {
  user: User | null;
  isSelf: boolean;
  templates: RoleTemplate[];
  builtIns: BuiltInRole[];
  onTemplatesChanged: () => void;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const { can } = useAuth();
  const editing = !!user;
  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [designation, setDesignation] = useState(user?.designation ?? "");
  const [role, setRole] = useState<Role>(user?.role ?? "CASHIER");
  const [templateId, setTemplateId] = useState<string | null>(user?.roleTemplateId ?? null);
  const [departmentId, setDepartmentId] = useState(user?.role === "ADMIN" ? "admin" : (user?.roleTemplate?.department?.id ?? ""));
  const [isActive, setIsActive] = useState(user?.isActive ?? true);
  // Own POS discount ceiling; blank = the role's limit
  const [maxDiscount, setMaxDiscount] = useState(user?.maxDiscountPct == null ? "" : String(Number(user.maxDiscountPct)));
  const canSetDiscount = editing && !isSelf && role !== "ADMIN" && can("roles.edit");
  // Branches the user may work in. The first ticked is their home branch
  const [branchIds, setBranchIds] = useState<string[]>(user?.branchIds?.length ? user.branchIds : user?.branchId ? [user.branchId] : []);
  // "All Branches" ticked: saved as an empty branch list
  const [allBranches, setAllBranches] = useState(!branchIds.length);
  const { branches, loading: branchesLoading } = useBranchOptions();
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [newRole, setNewRole] = useState(false);
  // A role just made from here, shown until the reloaded list has it
  const [createdTemplate, setCreatedTemplate] = useState<RoleTemplate | null>(null);
  const templates =
    createdTemplate && !loadedTemplates.some((t) => t.id === createdTemplate.id) ? [...loadedTemplates, createdTemplate] : loadedTemplates;

  // Someone holding permissions you don't have keeps their role and ticks; only an administrator can change those
  const canGrantAll = useCanGrantAll();
  const outranks = !!user && !canGrantAll(user.permissions ?? []);
  const accessLocked = isSelf || outranks;
  const template = templateId ? (templates.find((t) => t.id === templateId) ?? null) : null;
  // Exactly the role's permissions — nothing is ticked per person
  const permissions: Permission[] =
    role === "ADMIN" ? [] : template ? normalizePermissions(template.permissions) : user && !departmentId ? rolePerms(role, builtIns) : [];

  const pick = (r: Role, t: RoleTemplate | null) => {
    setRole(r);
    setTemplateId(t?.id ?? null);
  };

  // Another department: its role must be chosen again (picked straight away when it has only one)
  const changeDepartment = (id: string) => {
    setDepartmentId(id);
    const inDepartment = templates.filter((t) => t.departmentId === id);
    if (id === "admin") pick("ADMIN", null);
    else if (inDepartment.length === 1) pick(inDepartment[0].baseRole, inDepartment[0]);
    else setTemplateId(null);
  };

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (password && password.length < 6) return toast.error("Password must be at least 6 characters");
    if (!editing && !password) return toast.error("Set a password for the new user");
    if (!departmentId) return toast.error("Choose the user's department");
    if (departmentId !== "admin" && !templateId) return toast.error("Choose the user's role in the department");
    if (!allBranches && !branchIds.length) return toast.error("Choose the user's branches, or All Branches");
    const discount = maxDiscount.trim() === "" ? null : Number(maxDiscount);
    if (canSetDiscount && discount !== null && !(discount >= 0 && discount <= 100)) return toast.error("Max discount must be between 0 and 100%");
    setSaving(true);
    try {
      const access = { role, roleTemplateId: role === "ADMIN" ? null : templateId };
      if (editing) {
        const body: Record<string, unknown> = { name: name.trim(), phone: phone.trim(), designation: designation.trim(), branchIds: allBranches ? [] : branchIds };
        if (!isSelf) Object.assign(body, outranks ? {} : access, { isActive });
        if (password) body.password = password;
        if (canSetDiscount) body.maxDiscountPct = discount;
        await api.patch(`/users/${user.id}`, body);
        toast.success(password ? "User updated and password reset" : "User updated");
      } else {
        await api.post<User>("/users", { name: name.trim(), email: email.trim(), phone: phone.trim() || undefined, designation: designation.trim() || undefined, password, branchIds: allBranches ? [] : branchIds, ...access, isActive });
        toast.success(
          isActive
            ? `${name.trim()} can now sign in as ${template?.name ?? role.toLowerCase()}`
            : `${name.trim()} added as inactive — set them Active to let them sign in`,
        );
      }
      onSaved();
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={editing ? `Edit ${user.name}` : "New User"}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="user-form" loading={saving}>
            {editing ? "Save Changes" : "Create User"}
          </Button>
        </>
      }
    >
      <form id="user-form" onSubmit={save} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Full Name" required>
          <Input value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
        </Field>
        <Field label="Phone">
          <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Field>
        <Field label="Designation" hint="Job title, e.g. Senior Accountant" className="sm:col-span-2">
          <Input value={designation} onChange={(e) => setDesignation(e.target.value)} placeholder="Optional" />
        </Field>
        <Field label="Email (Used to Sign In)" required={!editing} hint={editing ? "Email cannot be changed" : undefined}>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required={!editing} disabled={editing} />
        </Field>
        <Field
          label={editing ? "Reset Password" : "Password"}
          required={!editing}
          hint={editing ? "Leave blank to keep the current password" : "At least 6 characters"}
        >
          <Input isPassword autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} required={!editing} />
        </Field>
        <div className="sm:col-span-2">
          <DepartmentRolePicker
            role={role}
            templateId={templateId}
            departmentId={departmentId}
            templates={templates}
            onDepartment={changeDepartment}
            onPick={pick}
            onNewRole={can("roles.create") ? () => setNewRole(true) : undefined}
            disabled={accessLocked}
          />
          {isSelf ? (
            <p className="mt-1 text-xs text-slate-400">You can&apos;t change your own role, permissions or disable your own account.</p>
          ) : outranks ? (
            <p className="mt-1 text-xs text-slate-400">This person has permissions you don&apos;t hold, so only an administrator can change their role.</p>
          ) : (
            <p className="mt-1 text-xs text-slate-400">
              The department role alone decides what this person may do. To change their access, edit the role or give them another one.
            </p>
          )}
        </div>
        {(role === "ADMIN" || template) && (
          <PermissionPicker value={permissions} onChange={() => {}} defaults={permissions} disabled admin={role === "ADMIN"} />
        )}
        {/* A group, not a Field: Field is a <label>, and checkboxes inside one would toggle the wrong box */}
        <div role="group" aria-label="Branches" className="sm:col-span-2">
          <p className="mb-1 text-xs font-medium text-slate-600">Branches</p>
          <Dropdown
            multiple
            isSearch={branches.length > 8}
            searchPlaceholder="Search branches…"
            placeholder="Choose branches"
            aria-label="Branches"
            options={[
              { value: ALL_BRANCHES, label: "All Branches" },
              ...branches.map((b) => ({ value: b.id, label: b.name, hint: b.code })),
              // A branch the user still has but that is now inactive
              ...branchIds
                .filter((id) => !branches.some((b) => b.id === id))
                .map((id) => ({
                  value: id,
                  label: user?.branch?.id === id ? user.branch.name : branchesLoading ? "Loading…" : "Inactive branch",
                  hint: user?.branch?.id === id && !branchesLoading ? `${user.branch.code} · inactive` : undefined,
                })),
            ]}
            values={allBranches ? [ALL_BRANCHES, ...branches.map((b) => b.id)] : branchIds}
            onValuesChange={(next) => {
              // "All Branches" ticks every branch; unticking it clears them all, unticking one branch keeps the rest
              const all = next.includes(ALL_BRANCHES);
              if (!allBranches && all) {
                setAllBranches(true);
                return setBranchIds([]);
              }
              setAllBranches(false);
              setBranchIds(allBranches && !all ? [] : next.filter((v) => v !== ALL_BRANCHES));
            }}
          />
          <p className="mt-1 text-xs text-slate-400">
            {allBranches
              ? "Can switch between all branches from the top bar"
              : role === "ADMIN"
                ? "Administrators can still switch to any branch; the first ticked is where they start"
                : !branchIds.length
                ? "Tick the branches they may work in"
                : branchIds.length === 1
                  ? "Locked to this branch — they only see and work in it"
                  : "Can switch between these branches only; the first ticked is where they start"}
          </p>
        </div>
        {canSetDiscount && (
          <Field label="Max POS Discount %" hint="For this person only. Blank = their role's limit; above it needs a manager's approval">
            <Input type="number" min="0" max="100" step="0.5" value={maxDiscount} onChange={(e) => setMaxDiscount(e.target.value)} placeholder="Role's limit" className="num" />
          </Field>
        )}
        {!isSelf && (
          <Field label="Status" required hint="Only active users can sign in">
            <Select value={isActive ? "active" : "inactive"} onChange={(e) => setIsActive(e.target.value === "active")} aria-label="Status">
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </Select>
          </Field>
        )}
      </form>
      {newRole && (
        <RoleTemplateForm
          template={null}
          initialDepartmentId={departmentId || null}
          onClose={() => setNewRole(false)}
          onSaved={(t) => {
            setNewRole(false);
            setCreatedTemplate(t);
            onTemplatesChanged();
            setDepartmentId(t.departmentId ?? "");
            pick(t.baseRole, t);
          }}
        />
      )}
    </Modal>
  );
}
