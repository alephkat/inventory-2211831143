import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Pencil, Plus, Trash2 } from "lucide-react";
import { api, normalizeList } from "@/lib/api";
import { useToast } from "@/lib/ToastProvider";
import { errorMessage, formatNumber } from "@/lib/format";
import { Alert, Badge, Button, Card, Field, Input, PageHeader } from "@/components/ui";
import { DataTable } from "@/components/DataTable";
import { ConfirmDialog } from "@/components/feedback";
const EMPTY_FORM = {
    name: "",
    code: "",
    address: "",
    contactPerson: "",
    phone: "",
    managerId: "",
    currentCapacity: "",
    maxCapacity: ""
};
const toNullable = (value) => value.trim() === "" ? null : value.trim();
const toNullableNumber = (value) => value.trim() === "" ? null : Number(value);
function WarehousesPage() {
    const queryClient = useQueryClient();
    const toast = useToast();
    const [form, setForm] = useState(EMPTY_FORM);
    const [editingId, setEditingId] = useState(null);
    const [formError, setFormError] = useState("");
    const [confirm, setConfirm] = useState(null);
    const warehouses = useQuery({
        queryKey: ["warehouses", "all"],
        queryFn: () => api.get("/api/v1/warehouses", { limit: 100 })
    });
    const users = useQuery({
        queryKey: ["users", "all"],
        queryFn: () => api.get("/api/v1/users", { limit: 100 })
    });
    const list = normalizeList(warehouses.data, 100).items;
    const managerOptions = normalizeList(users.data, 100).items;
    const save = useMutation({
        mutationFn: (payload) => {
            const body = {
                name: payload.name,
                code: toNullable(payload.code ?? ""),
                address: toNullable(payload.address ?? ""),
                contactPerson: toNullable(payload.contactPerson ?? ""),
                phone: toNullable(payload.phone ?? ""),
                managerId: toNullable(payload.managerId ?? ""),
                currentCapacity: toNullableNumber(payload.currentCapacity ?? ""),
                maxCapacity: toNullableNumber(payload.maxCapacity ?? "")
            };
            return editingId ? api.put(`/api/v1/warehouses/${editingId}`, body) : api.post("/api/v1/warehouses", body);
        },
        onSuccess: () => {
            toast.success(editingId ? "Warehouse updated" : "Warehouse created");
            setEditingId(null);
            setForm(EMPTY_FORM);
            void queryClient.invalidateQueries({ queryKey: ["warehouses"] });
            void queryClient.invalidateQueries({ queryKey: ["users"] });
        },
        onError: (error) => setFormError(errorMessage(error, "Could not save the warehouse"))
    });
    const remove = useMutation({
        mutationFn: (id) => api.delete(`/api/v1/warehouses/${id}`),
        onSuccess: () => {
            toast.success("Warehouse deleted");
            void queryClient.invalidateQueries({ queryKey: ["warehouses"] });
        },
        onError: (error) => toast.error(error, "Could not delete the warehouse")
    });
    const handleSubmit = (event) => {
        event.preventDefault();
        if (!form.name.trim()) {
            setFormError("Warehouse name is required.");
            return;
        }
        const max = form.maxCapacity.trim() === "" ? null : Number(form.maxCapacity);
        const current = form.currentCapacity.trim() === "" ? null : Number(form.currentCapacity);
        if (max != null && current != null && current > max) {
            setFormError("Current capacity cannot exceed the maximum.");
            return;
        }
        save.mutate(form);
    };
    const resetForm = () => {
        setEditingId(null);
        setForm(EMPTY_FORM);
        setFormError("");
    };
    const columns = [
        {
            key: "name",
            header: "Warehouse",
            render: (warehouse) => _jsxs("div", { className: "flex items-center gap-3", children: [_jsx("span", { className: "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600", children: _jsx(Building2, { className: "h-4 w-4" }) }), _jsxs("div", { className: "min-w-0", children: [_jsx("p", { className: "truncate font-medium text-slate-900", children: warehouse.name }), _jsx("p", { className: "truncate font-mono text-xs text-slate-500", children: warehouse.code ?? "\u2014" })] })] })
        },
        {
            key: "address",
            header: "Address",
            secondary: true,
            render: (warehouse) => _jsxs("div", { className: "min-w-0", children: [_jsx("p", { className: "truncate text-slate-700", children: warehouse.address ?? "\u2014" }), _jsxs("p", { className: "truncate text-xs text-slate-500", children: [warehouse.contactPerson ?? "", warehouse.contactPerson && warehouse.phone ? " \xB7 " : "", warehouse.phone ?? ""] })] })
        },
        {
            key: "capacity",
            header: "Capacity",
            secondary: true,
            render: (warehouse) => {
                if (warehouse.maxCapacity == null) {
                    return _jsx("span", { className: "text-slate-400", children: "No limit" });
                }
                const current = warehouse.currentCapacity ?? 0;
                const pct = Math.min(100, current / warehouse.maxCapacity * 100);
                return _jsxs("div", { className: "min-w-[8rem]", children: [_jsxs("p", { className: "tabular text-xs text-slate-600", children: [formatNumber(current), " / ", formatNumber(warehouse.maxCapacity)] }), _jsx("div", { className: "mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-200", children: _jsx("div", { className: pct >= 90 ? "h-full bg-red-500" : pct >= 75 ? "h-full bg-amber-500" : "h-full bg-brand-500", style: { width: `${pct}%` } }) })] });
            }
        },
        {
            key: "status",
            header: "Status",
            render: (warehouse) => _jsx(Badge, { tone: warehouse.isActive ? "success" : "neutral", children: warehouse.isActive ? "Active" : "Inactive" })
        },
        {
            key: "actions",
            header: "",
            headerClassName: "text-right",
            className: "text-right",
            render: (warehouse) => _jsxs("div", { className: "flex items-center justify-end gap-1", children: [_jsx(Button, { variant: "ghost", size: "sm", onClick: () => {
                            setEditingId(warehouse.id);
                            setForm({
                                name: warehouse.name,
                                code: warehouse.code ?? "",
                                address: warehouse.address ?? "",
                                contactPerson: warehouse.contactPerson ?? "",
                                phone: warehouse.phone ?? "",
                                managerId: warehouse.managerId ?? "",
                                currentCapacity: warehouse.currentCapacity == null ? "" : String(warehouse.currentCapacity),
                                maxCapacity: warehouse.maxCapacity == null ? "" : String(warehouse.maxCapacity)
                            });
                            setFormError("");
                            window.scrollTo({ top: 0, behavior: "smooth" });
                        }, "aria-label": `Edit ${warehouse.name}`, children: _jsx(Pencil, { className: "h-3.5 w-3.5" }) }), _jsx(Button, { variant: "ghost", size: "sm", className: "text-red-600 hover:bg-red-50", onClick: () => setConfirm({
                            title: "Delete warehouse",
                            message: `Permanently delete "${warehouse.name}"? All stock records held in this warehouse would be removed.`,
                            confirmLabel: "Delete warehouse",
                            destructive: true,
                            onConfirm: async () => {
                                await remove.mutateAsync(warehouse.id);
                                setConfirm(null);
                            }
                        }), "aria-label": `Delete ${warehouse.name}`, children: _jsx(Trash2, { className: "h-3.5 w-3.5" }) })] })
        }
    ];
    return _jsxs("div", { className: "space-y-5", children: [_jsx(PageHeader, { title: "Warehouses", description: `${list.length} location${list.length === 1 ? "" : "s"} configured` }), _jsx(Card, { children: _jsxs("form", { onSubmit: handleSubmit, className: "space-y-4", noValidate: true, children: [_jsxs("div", { className: "grid gap-4 sm:grid-cols-2 lg:grid-cols-4", children: [_jsx(Field, { label: "Warehouse name", htmlFor: "warehouse-name", required: true, children: _jsx(Input, { id: "warehouse-name", value: form.name, onChange: (event) => setForm({ ...form, name: event.target.value }), placeholder: "Main Warehouse" }) }), _jsx(Field, { label: "Code", htmlFor: "warehouse-code", children: _jsx(Input, { id: "warehouse-code", value: form.code, onChange: (event) => setForm({ ...form, code: event.target.value }), placeholder: "WH-001" }) }), _jsx(Field, { label: "Contact person", htmlFor: "warehouse-contact", children: _jsx(Input, { id: "warehouse-contact", value: form.contactPerson, onChange: (event) => setForm({ ...form, contactPerson: event.target.value }), placeholder: "Optional" }) }), _jsx(Field, { label: "Phone", htmlFor: "warehouse-phone", children: _jsx(Input, { id: "warehouse-phone", value: form.phone, onChange: (event) => setForm({ ...form, phone: event.target.value }), placeholder: "Optional" }) }), _jsx(Field, { label: "Manager", htmlFor: "warehouse-manager", className: "lg:col-span-2", children: _jsxs("select", { id: "warehouse-manager", className: "input", value: form.managerId, onChange: (event) => setForm({ ...form, managerId: event.target.value }), children: [_jsx("option", { value: "", children: "No manager assigned" }), managerOptions.map((user) => _jsxs("option", { value: user.id, children: [user.fullName, " (", user.username, ")"] }, user.id))] }) }), _jsx(Field, { label: "Current capacity", htmlFor: "warehouse-current", hint: "Units stored", children: _jsx(Input, { id: "warehouse-current", type: "number", step: "0.01", min: "0", value: form.currentCapacity, onChange: (event) => setForm({ ...form, currentCapacity: event.target.value }), placeholder: "0" }) }), _jsx(Field, { label: "Maximum capacity", htmlFor: "warehouse-max", hint: "Leave blank for no limit", children: _jsx(Input, { id: "warehouse-max", type: "number", step: "0.01", min: "0", value: form.maxCapacity, onChange: (event) => setForm({ ...form, maxCapacity: event.target.value }), placeholder: "10000" }) }), _jsx(Field, { label: "Address", htmlFor: "warehouse-address", className: "sm:col-span-2 lg:col-span-4", children: _jsx(Input, { id: "warehouse-address", value: form.address, onChange: (event) => setForm({ ...form, address: event.target.value }), placeholder: "123 Inventory St, Springfield" }) })] }), formError ? _jsx(Alert, { tone: "danger", children: formError }) : null, _jsxs("div", { className: "flex gap-2", children: [_jsx(Button, { type: "submit", icon: _jsx(Plus, { className: "h-4 w-4" }), loading: save.isPending, children: editingId ? "Save changes" : "Add warehouse" }), editingId ? _jsx(Button, { type: "button", variant: "secondary", onClick: resetForm, children: "Cancel edit" }) : null] })] }) }), _jsx(Card, { padded: false, children: _jsx(DataTable, { columns: columns, rows: list, rowKey: (warehouse) => warehouse.id, isLoading: warehouses.isLoading, error: warehouses.error, emptyTitle: "No warehouses yet", emptyDescription: "Add a warehouse to start tracking stock levels." }) }), _jsx(ConfirmDialog, { open: confirm !== null, onClose: () => setConfirm(null), title: confirm?.title ?? "", message: confirm?.message ?? "", confirmLabel: confirm?.confirmLabel, destructive: confirm?.destructive, onConfirm: confirm?.onConfirm ?? (() => void 0), isConfirming: remove.isPending, error: remove.error })] });
}
export { WarehousesPage };
