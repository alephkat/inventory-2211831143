import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import { api, normalizeList } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/lib/ToastProvider";
import { formatDateTime, humanize } from "@/lib/format";
import { Alert, Button, Card, Field, Input, PageHeader, Select } from "@/components/ui";
import { DataTable, Pagination } from "@/components/DataTable";
import { ConfirmDialog } from "@/components/feedback";
import { StatusBadge } from "@/components/StatusBadge";
const STATUS_OPTIONS = ["ACTIVE", "INACTIVE", "SUSPENDED", "PENDING_APPROVAL"];
const EMPTY_FORM = {
    username: "",
    email: "",
    fullName: "",
    password: "",
    roleId: "",
    warehouseId: "",
    status: "ACTIVE"
};
function UsersPage() {
    const { user: currentUser } = useAuth();
    const queryClient = useQueryClient();
    const toast = useToast();
    const searchTimer = useRef();
    const [search, setSearch] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");
    const [roleId, setRoleId] = useState("");
    const [status, setStatus] = useState("");
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(20);
    const [form, setForm] = useState(EMPTY_FORM);
    const [editingId, setEditingId] = useState(null);
    const [formError, setFormError] = useState("");
    const [confirm, setConfirm] = useState(null);
    const users = useQuery({
        queryKey: ["users", "list", debouncedSearch, roleId, status, page, limit],
        queryFn: () => api.get("/api/v1/users", {
            page,
            limit,
            search: debouncedSearch || void 0,
            roleId: roleId || void 0,
            status: status || void 0
        })
    });
    const roles = useQuery({
        queryKey: ["roles", "all"],
        queryFn: () => api.get("/api/v1/roles")
    });
    const warehouses = useQuery({
        queryKey: ["warehouses", "all"],
        queryFn: () => api.get("/api/v1/warehouses", { limit: 100 })
    });
    const list = normalizeList(users.data, limit);
    const roleOptions = roles.data ?? [];
    const warehouseOptions = normalizeList(warehouses.data, 100).items;
    const invalidate = () => {
        void queryClient.invalidateQueries({ queryKey: ["users"] });
        void queryClient.invalidateQueries({ queryKey: ["warehouses"] });
    };
    const createUser = useMutation({
        mutationFn: (payload) => api.post("/api/v1/auth/register/admin", {
            username: payload.username,
            email: payload.email,
            fullName: payload.fullName,
            password: payload.password,
            roleId: payload.roleId,
            warehouseId: payload.warehouseId || void 0
        }),
        onSuccess: () => {
            toast.success("User created");
            setEditingId(null);
            setForm(EMPTY_FORM);
            invalidate();
        },
        onError: (error) => setFormError(error.message || "Could not create the user")
    });
    const updateUser = useMutation({
        mutationFn: (payload) => api.put(`/api/v1/users/${editingId}`, {
            fullName: payload.fullName,
            email: payload.email,
            roleId: payload.roleId,
            warehouseId: payload.warehouseId || null,
            status: payload.status
        }),
        onSuccess: () => {
            toast.success("User updated");
            setEditingId(null);
            setForm(EMPTY_FORM);
            invalidate();
        },
        onError: (error) => setFormError(error.message || "Could not update the user")
    });
    const remove = useMutation({
        mutationFn: (id) => api.delete(`/api/v1/users/${id}`),
        onSuccess: () => {
            toast.success("User deleted");
            invalidate();
        },
        onError: (error) => toast.error(error, "Could not delete the user")
    });
    const scheduleSearch = (value) => {
        setSearch(value);
        window.clearTimeout(searchTimer.current);
        searchTimer.current = window.setTimeout(() => {
            setDebouncedSearch(value);
            setPage(1);
        }, 300);
    };
    const resetForm = () => {
        setEditingId(null);
        setForm(EMPTY_FORM);
        setFormError("");
    };
    const handleSubmit = () => {
        if (!editingId) {
            if (!form.username.trim()) {
                setFormError("Username is required.");
                return;
            }
            if (!form.fullName.trim()) {
                setFormError("Full name is required.");
                return;
            }
            if (!form.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
                setFormError("Enter a valid email address.");
                return;
            }
            if (form.password.length < 8) {
                setFormError("Password must be at least 8 characters.");
                return;
            }
            if (!form.roleId) {
                setFormError("Choose a role.");
                return;
            }
            setFormError("");
            createUser.mutate(form);
            return;
        }
        if (!form.fullName.trim()) {
            setFormError("Full name is required.");
            return;
        }
        if (!form.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
            setFormError("Enter a valid email address.");
            return;
        }
        setFormError("");
        updateUser.mutate(form);
    };
    const columns = [
        {
            key: "name",
            header: "User",
            render: (user) => _jsxs("div", { className: "min-w-0", children: [_jsx("p", { className: "truncate font-medium text-slate-900", children: user.fullName }), _jsxs("p", { className: "truncate text-xs text-slate-500", children: [user.username, " \u00B7 ", user.email] })] })
        },
        {
            key: "role",
            header: "Role",
            render: (user) => _jsx("span", { className: "text-sm text-slate-700", children: humanize(user.role?.name ?? "") })
        },
        {
            key: "status",
            header: "Status",
            render: (user) => _jsxs("div", { children: [_jsx(StatusBadge, { status: user.status }), !user.isActive ? _jsx("p", { className: "mt-0.5 text-[11px] text-slate-400", children: "Deactivated" }) : null] })
        },
        {
            key: "lastLogin",
            header: "Last sign-in",
            secondary: true,
            render: (user) => _jsx("span", { className: "whitespace-nowrap text-xs text-slate-500", children: user.lastLogin ? formatDateTime(user.lastLogin) : "Never" })
        },
        {
            key: "actions",
            header: "",
            headerClassName: "text-right",
            className: "text-right",
            render: (user) => {
                const isSelf = user.id === currentUser?.id;
                return _jsxs("div", { className: "flex items-center justify-end gap-1", children: [_jsx(Button, { variant: "ghost", size: "sm", onClick: () => {
                                setEditingId(user.id);
                                setForm({
                                    username: user.username,
                                    email: user.email,
                                    fullName: user.fullName,
                                    password: "",
                                    roleId: user.roleId,
                                    warehouseId: user.warehouseId ?? "",
                                    status: user.status
                                });
                                setFormError("");
                                window.scrollTo({ top: 0, behavior: "smooth" });
                            }, "aria-label": `Edit ${user.fullName}`, children: _jsx(Pencil, { className: "h-3.5 w-3.5" }) }), !isSelf ? _jsx(Button, { variant: "ghost", size: "sm", className: "text-red-600 hover:bg-red-50", onClick: () => setConfirm({
                                title: "Delete user",
                                message: `Permanently delete "${user.fullName}"? Their audit history stays, but their account and sessions are removed.`,
                                confirmLabel: "Delete user",
                                destructive: true,
                                onConfirm: async () => {
                                    await remove.mutateAsync(user.id);
                                    setConfirm(null);
                                }
                            }), "aria-label": `Delete ${user.fullName}`, children: _jsx(Trash2, { className: "h-3.5 w-3.5" }) }) : null] });
            }
        }
    ];
    return _jsxs("div", { className: "space-y-5", children: [_jsx(PageHeader, { title: "Users", description: `${list.total} account${list.total === 1 ? "" : "s"}` }), _jsxs(Card, { children: [_jsx("h2", { className: "mb-4 text-sm font-semibold text-slate-900", children: editingId ? `Editing ${form.fullName}` : "Create a user" }), _jsxs("div", { className: "space-y-4", children: [_jsxs("div", { className: "grid gap-4 sm:grid-cols-2 lg:grid-cols-3", children: [!editingId ? _jsx(Field, { label: "Username", htmlFor: "user-username", required: true, children: _jsx(Input, { id: "user-username", value: form.username, onChange: (event) => setForm({ ...form, username: event.target.value }), placeholder: "jsmith" }) }) : null, _jsx(Field, { label: "Full name", htmlFor: "user-fullname", required: true, children: _jsx(Input, { id: "user-fullname", value: form.fullName, onChange: (event) => setForm({ ...form, fullName: event.target.value }), placeholder: "Jane Smith" }) }), _jsx(Field, { label: "Email", htmlFor: "user-email", required: true, children: _jsx(Input, { id: "user-email", type: "email", value: form.email, onChange: (event) => setForm({ ...form, email: event.target.value }), placeholder: "jane@company.com" }) }), !editingId ? _jsx(Field, { label: "Password", htmlFor: "user-password", required: true, hint: "Minimum 8 characters", children: _jsx(Input, { id: "user-password", type: "password", autoComplete: "new-password", value: form.password, onChange: (event) => setForm({ ...form, password: event.target.value }) }) }) : null, _jsx(Field, { label: "Role", htmlFor: "user-role", required: true, children: _jsxs(Select, { id: "user-role", value: form.roleId, onChange: (event) => setForm({ ...form, roleId: event.target.value }), children: [_jsx("option", { value: "", children: "Select a role" }), roleOptions.map((role) => _jsx("option", { value: role.id, children: humanize(role.name) }, role.id))] }) }), _jsx(Field, { label: "Warehouse", htmlFor: "user-warehouse", children: _jsxs(Select, { id: "user-warehouse", value: form.warehouseId, onChange: (event) => setForm({ ...form, warehouseId: event.target.value }), children: [_jsx("option", { value: "", children: "No assigned warehouse" }), warehouseOptions.map((warehouse) => _jsx("option", { value: warehouse.id, children: warehouse.name }, warehouse.id))] }) }), editingId ? _jsx(Field, { label: "Account status", htmlFor: "user-status", children: _jsx(Select, { id: "user-status", value: STATUS_OPTIONS.includes(form.status ?? "") ? form.status : "ACTIVE", onChange: (event) => setForm({ ...form, status: event.target.value }), children: STATUS_OPTIONS.map((option) => _jsx("option", { value: option, children: humanize(option) }, option)) }) }) : null] }), formError ? _jsx(Alert, { tone: "danger", children: formError }) : null, _jsxs("div", { className: "flex gap-2", children: [_jsx(Button, { icon: _jsx(Plus, { className: "h-4 w-4" }), onClick: handleSubmit, loading: createUser.isPending || updateUser.isPending, children: editingId ? "Save changes" : "Create user" }), editingId ? _jsx(Button, { variant: "secondary", onClick: resetForm, children: "Cancel edit" }) : null] })] })] }), _jsxs(Card, { padded: false, children: [_jsxs("div", { className: "grid gap-3 border-b border-slate-200 p-4 sm:grid-cols-3", children: [_jsx(Field, { label: "Search", className: "sm:col-span-1", children: _jsxs("div", { className: "relative", children: [_jsx(Search, { className: "pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" }), _jsx(Input, { className: "pl-9", placeholder: "Name, username or email\u2026", value: search, onChange: (event) => {
                                                scheduleSearch(event.target.value);
                                                setPage(1);
                                            } })] }) }), _jsx(Field, { label: "Role", children: _jsxs(Select, { value: roleId, onChange: (event) => {
                                        setRoleId(event.target.value);
                                        setPage(1);
                                    }, children: [_jsx("option", { value: "", children: "All roles" }), roleOptions.map((role) => _jsx("option", { value: role.id, children: humanize(role.name) }, role.id))] }) }), _jsx(Field, { label: "Status", children: _jsxs(Select, { value: status, onChange: (event) => {
                                        setStatus(event.target.value);
                                        setPage(1);
                                    }, children: [_jsx("option", { value: "", children: "All statuses" }), STATUS_OPTIONS.map((option) => _jsx("option", { value: option, children: humanize(option) }, option))] }) })] }), _jsx(DataTable, { columns: columns, rows: list.items, rowKey: (user) => user.id, isLoading: users.isLoading, error: users.error, emptyTitle: "No users found", emptyDescription: "Adjust the filters or create a new account." }), list.total > 0 ? _jsx(Pagination, { page: page, limit: limit, total: list.total, onPageChange: setPage, onLimitChange: (value) => {
                            setLimit(value);
                            setPage(1);
                        } }) : null] }), _jsx(ConfirmDialog, { open: confirm !== null, onClose: () => setConfirm(null), title: confirm?.title ?? "", message: confirm?.message ?? "", confirmLabel: confirm?.confirmLabel, destructive: confirm?.destructive, onConfirm: confirm?.onConfirm ?? (() => void 0), isConfirming: remove.isPending, error: remove.error })] });
}
export { UsersPage };
