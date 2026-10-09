import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Plus, Users as UsersIcon } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/lib/ToastProvider";
import { humanize } from "@/lib/format";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  Field,
  Input,
  LoadingBlock,
  Modal,
  PageHeader
} from "@/components/ui";
function groupByResource(permissions) {
  const groups = /* @__PURE__ */ new Map();
  for (const permission of permissions) {
    const bucket = groups.get(permission.resource) ?? [];
    bucket.push(permission);
    groups.set(permission.resource, bucket);
  }
  return groups;
}
function RolesPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { user: currentUser } = useAuth();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newRole, setNewRole] = useState({ name: "", description: "" });
  const [createError, setCreateError] = useState("");
  const [editingRole, setEditingRole] = useState(null);
  const [selectedPermissions, setSelectedPermissions] = useState(/* @__PURE__ */ new Set());
  const roles = useQuery({
    queryKey: ["roles", "all"],
    queryFn: () => api.get("/api/v1/roles")
  });
  const permissions = useQuery({
    queryKey: ["permissions", "all"],
    queryFn: () => api.get("/api/v1/auth/permissions")
  });
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["roles"] });
    void queryClient.invalidateQueries({ queryKey: ["users"] });
  };
  const createRole = useMutation({
    mutationFn: () => api.post("/api/v1/roles", newRole),
    onSuccess: () => {
      toast.success("Role created");
      setIsCreateOpen(false);
      setNewRole({ name: "", description: "" });
      invalidate();
    },
    onError: (error) => setCreateError(error.message || "Could not create the role")
  });
  const savePermissions = useMutation({
    mutationFn: () => api.post(`/api/v1/roles/${editingRole.id}/permissions`, {
      permissionValues: Array.from(selectedPermissions)
    }),
    onSuccess: () => {
      toast.success("Permissions updated");
      setEditingRole(null);
      invalidate();
    },
    onError: (error) => toast.error(error, "Could not save permissions")
  });
  const openPermissionEditor = (role) => {
    setEditingRole(role);
    setSelectedPermissions(
      new Set((role.permissions ?? []).map((rp) => rp.permission.value))
    );
  };
  const togglePermission = (value) => {
    setSelectedPermissions((current) => {
      const next = new Set(current);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  };
  const permissionList = permissions.data ?? [];
  const grouped = groupByResource(permissionList);
  return <div className="space-y-5">
      <PageHeader
    title="Roles & permissions"
    description="Control what each kind of user can see and do"
    actions={<Button icon={<Plus className="h-4 w-4" />} onClick={() => setIsCreateOpen(true)}>
            New role
          </Button>}
  />

      <Card padded={false}>
        <CardHeader
    title="System roles"
    description="Permissions are re-read from the database on every request, so a change takes effect immediately"
  />

        {roles.isLoading ? <LoadingBlock /> : roles.error ? <div className="p-5">
            <Alert tone="danger">Could not load roles.</Alert>
          </div> : <div className="divide-y divide-slate-100">
            {(roles.data ?? []).map((role) => {
    const granted = (role.permissions ?? []).map((rp) => rp.permission.value);
    const isOwnRole = currentUser?.roleId === role.id;
    return <div key={role.id} className="flex flex-wrap items-start gap-4 px-5 py-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-slate-900">{humanize(role.name)}</p>
                      {role.isSystem ? <Badge tone="info">System</Badge> : null}
                      {isOwnRole ? <Badge tone="brand">Your role</Badge> : null}
                    </div>
                    {role.description ? <p className="mt-1 text-sm text-slate-500">{role.description}</p> : null}
                    <p className="mt-2 text-xs text-slate-500">
                      {granted.length} of {permissionList.length} permissions
                    </p>
                  </div>
                  <Button variant="secondary" size="sm" onClick={() => openPermissionEditor(role)}>
                    Edit permissions
                  </Button>
                </div>;
  })}
          </div>}
      </Card>

      <Card>
        <div className="flex items-start gap-3">
          <span className="rounded-lg bg-brand-50 p-2.5 text-brand-600">
            <UsersIcon className="h-5 w-5" />
          </span>
          <div className="min-w-0 text-sm text-slate-600">
            <p className="font-medium text-slate-900">Separation of duties</p>
            <p className="mt-1">
              Each workflow has one permission to <em>propose</em> a document and another to{" "}
              <em>approve</em> it. Keeping them apart is what stops a storekeeper approving their
              own stock receipts.
            </p>
          </div>
        </div>
      </Card>

      {
    /* ----------------------------------------------------- Create role */
  }
      <Modal
    open={isCreateOpen}
    onClose={() => setIsCreateOpen(false)}
    title="New role"
    description="Give it a name, then assign permissions."
    size="sm"
    footer={<>
            <Button variant="secondary" onClick={() => setIsCreateOpen(false)}>
              Cancel
            </Button>
            <Button
      onClick={() => {
        if (!newRole.name.trim()) {
          setCreateError("Role name is required.");
          return;
        }
        setCreateError("");
        createRole.mutate();
      }}
      loading={createRole.isPending}
    >
              Create role
            </Button>
          </>}
  >
        <div className="space-y-4">
          <Field label="Role name" htmlFor="role-name" required>
            <Input
    id="role-name"
    value={newRole.name}
    onChange={(event) => setNewRole({ ...newRole, name: event.target.value })}
    placeholder="shift_supervisor"
  />
          </Field>
          <Field label="Description" htmlFor="role-description">
            <Input
    id="role-description"
    value={newRole.description}
    onChange={(event) => setNewRole({ ...newRole, description: event.target.value })}
    placeholder="What this role is for"
  />
          </Field>
          {createError ? <Alert tone="danger">{createError}</Alert> : null}
        </div>
      </Modal>

      {
    /* ------------------------------------------------ Edit permissions */
  }
      <Modal
    open={editingRole !== null}
    onClose={() => setEditingRole(null)}
    title={`Permissions \u2014 ${editingRole ? humanize(editingRole.name) : ""}`}
    description="Tick everything this role should be allowed to do."
    size="lg"
    footer={<>
            <Button variant="secondary" onClick={() => setEditingRole(null)}>
              Cancel
            </Button>
            <Button
      onClick={() => savePermissions.mutate()}
      loading={savePermissions.isPending}
    >
              <Check className="h-4 w-4" />
              Save permissions
            </Button>
          </>}
  >
        <div className="space-y-5">
          {Array.from(grouped.entries()).map(([resource, items]) => <div key={resource}>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                {humanize(resource)}
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {items.map((permission) => <label
    key={permission.value}
    className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-slate-200 p-2.5 transition hover:border-brand-300 has-[:checked]:border-brand-400 has-[:checked]:bg-brand-50/40"
  >
                    <input
    type="checkbox"
    className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
    checked={selectedPermissions.has(permission.value)}
    onChange={() => togglePermission(permission.value)}
  />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-slate-800">
                        {permission.name}
                      </span>
                      <span className="block text-xs text-slate-500">
                        {permission.description}
                      </span>
                    </span>
                  </label>)}
              </div>
            </div>)}

          {savePermissions.error ? <Alert tone="danger">{savePermissions.error.message}</Alert> : null}
        </div>
      </Modal>
    </div>;
}
export {
  RolesPage
};
