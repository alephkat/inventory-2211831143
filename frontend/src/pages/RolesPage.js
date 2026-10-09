import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Plus, Users as UsersIcon } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/lib/ToastProvider";
import { humanize } from "@/lib/format";
import { Alert, Badge, Button, Card, CardHeader, Field, Input, LoadingBlock, Modal, PageHeader } from "@/components/ui";
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
        setSelectedPermissions(new Set((role.permissions ?? []).map((rp) => rp.permission.value)));
    };
    const togglePermission = (value) => {
        setSelectedPermissions((current) => {
            const next = new Set(current);
            if (next.has(value))
                next.delete(value);
            else
                next.add(value);
            return next;
        });
    };
    const permissionList = permissions.data ?? [];
    const grouped = groupByResource(permissionList);
    return _jsxs("div", { className: "space-y-5", children: [_jsx(PageHeader, { title: "Roles & permissions", description: "Control what each kind of user can see and do", actions: _jsx(Button, { icon: _jsx(Plus, { className: "h-4 w-4" }), onClick: () => setIsCreateOpen(true), children: "New role" }) }), _jsxs(Card, { padded: false, children: [_jsx(CardHeader, { title: "System roles", description: "Permissions are re-read from the database on every request, so a change takes effect immediately" }), roles.isLoading ? _jsx(LoadingBlock, {}) : roles.error ? _jsx("div", { className: "p-5", children: _jsx(Alert, { tone: "danger", children: "Could not load roles." }) }) : _jsx("div", { className: "divide-y divide-slate-100", children: (roles.data ?? []).map((role) => {
                            const granted = (role.permissions ?? []).map((rp) => rp.permission.value);
                            const isOwnRole = currentUser?.roleId === role.id;
                            return _jsxs("div", { className: "flex flex-wrap items-start gap-4 px-5 py-4", children: [_jsxs("div", { className: "min-w-0 flex-1", children: [_jsxs("div", { className: "flex flex-wrap items-center gap-2", children: [_jsx("p", { className: "text-sm font-semibold text-slate-900", children: humanize(role.name) }), role.isSystem ? _jsx(Badge, { tone: "info", children: "System" }) : null, isOwnRole ? _jsx(Badge, { tone: "brand", children: "Your role" }) : null] }), role.description ? _jsx("p", { className: "mt-1 text-sm text-slate-500", children: role.description }) : null, _jsxs("p", { className: "mt-2 text-xs text-slate-500", children: [granted.length, " of ", permissionList.length, " permissions"] })] }), _jsx(Button, { variant: "secondary", size: "sm", onClick: () => openPermissionEditor(role), children: "Edit permissions" })] }, role.id);
                        }) })] }), _jsx(Card, { children: _jsxs("div", { className: "flex items-start gap-3", children: [_jsx("span", { className: "rounded-lg bg-brand-50 p-2.5 text-brand-600", children: _jsx(UsersIcon, { className: "h-5 w-5" }) }), _jsxs("div", { className: "min-w-0 text-sm text-slate-600", children: [_jsx("p", { className: "font-medium text-slate-900", children: "Separation of duties" }), _jsxs("p", { className: "mt-1", children: ["Each workflow has one permission to ", _jsx("em", { children: "propose" }), " a document and another to", " ", _jsx("em", { children: "approve" }), " it. Keeping them apart is what stops a storekeeper approving their own stock receipts."] })] })] }) }), _jsx(Modal, { open: isCreateOpen, onClose: () => setIsCreateOpen(false), title: "New role", description: "Give it a name, then assign permissions.", size: "sm", footer: _jsxs(_Fragment, { children: [_jsx(Button, { variant: "secondary", onClick: () => setIsCreateOpen(false), children: "Cancel" }), _jsx(Button, { onClick: () => {
                                if (!newRole.name.trim()) {
                                    setCreateError("Role name is required.");
                                    return;
                                }
                                setCreateError("");
                                createRole.mutate();
                            }, loading: createRole.isPending, children: "Create role" })] }), children: _jsxs("div", { className: "space-y-4", children: [_jsx(Field, { label: "Role name", htmlFor: "role-name", required: true, children: _jsx(Input, { id: "role-name", value: newRole.name, onChange: (event) => setNewRole({ ...newRole, name: event.target.value }), placeholder: "shift_supervisor" }) }), _jsx(Field, { label: "Description", htmlFor: "role-description", children: _jsx(Input, { id: "role-description", value: newRole.description, onChange: (event) => setNewRole({ ...newRole, description: event.target.value }), placeholder: "What this role is for" }) }), createError ? _jsx(Alert, { tone: "danger", children: createError }) : null] }) }), _jsx(Modal, { open: editingRole !== null, onClose: () => setEditingRole(null), title: `Permissions \u2014 ${editingRole ? humanize(editingRole.name) : ""}`, description: "Tick everything this role should be allowed to do.", size: "lg", footer: _jsxs(_Fragment, { children: [_jsx(Button, { variant: "secondary", onClick: () => setEditingRole(null), children: "Cancel" }), _jsxs(Button, { onClick: () => savePermissions.mutate(), loading: savePermissions.isPending, children: [_jsx(Check, { className: "h-4 w-4" }), "Save permissions"] })] }), children: _jsxs("div", { className: "space-y-5", children: [Array.from(grouped.entries()).map(([resource, items]) => _jsxs("div", { children: [_jsx("p", { className: "mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500", children: humanize(resource) }), _jsx("div", { className: "grid gap-2 sm:grid-cols-2", children: items.map((permission) => _jsxs("label", { className: "flex cursor-pointer items-start gap-2.5 rounded-lg border border-slate-200 p-2.5 transition hover:border-brand-300 has-[:checked]:border-brand-400 has-[:checked]:bg-brand-50/40", children: [_jsx("input", { type: "checkbox", className: "mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-brand-600 focus:ring-brand-500", checked: selectedPermissions.has(permission.value), onChange: () => togglePermission(permission.value) }), _jsxs("span", { className: "min-w-0", children: [_jsx("span", { className: "block text-sm font-medium text-slate-800", children: permission.name }), _jsx("span", { className: "block text-xs text-slate-500", children: permission.description })] })] }, permission.value)) })] }, resource)), savePermissions.error ? _jsx(Alert, { tone: "danger", children: savePermissions.error.message }) : null] }) })] });
}
export { RolesPage };
