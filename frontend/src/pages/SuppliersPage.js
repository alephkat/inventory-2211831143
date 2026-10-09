import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, Check, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { api, normalizeList } from "@/lib/api";
import { useToast } from "@/lib/ToastProvider";
import { errorMessage } from "@/lib/format";
import { Alert, Button, Card, Field, Input, Modal, PageHeader, Textarea } from "@/components/ui";
import { DataTable, Pagination } from "@/components/DataTable";
import { ConfirmDialog } from "@/components/feedback";
import { StatusBadge } from "@/components/StatusBadge";
const STATUS_OPTIONS = ["PENDING_APPROVAL", "ACTIVE", "INACTIVE", "REJECTED", "BLACKLISTED"];
const EMPTY_FORM = {
    name: "",
    code: "",
    contactPerson: "",
    phone: "",
    email: "",
    address: "",
    taxId: "",
    paymentTerms: ""
};
const toNullable = (value) => value.trim() === "" ? null : value.trim();
function SuppliersPage() {
    const queryClient = useQueryClient();
    const toast = useToast();
    const searchTimer = useRef();
    const [search, setSearch] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");
    const [status, setStatus] = useState("");
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(20);
    const [form, setForm] = useState(EMPTY_FORM);
    const [editingId, setEditingId] = useState(null);
    const [formError, setFormError] = useState("");
    const [reasonTarget, setReasonTarget] = useState(null);
    const [reason, setReason] = useState("");
    const [confirm, setConfirm] = useState(null);
    const suppliers = useQuery({
        queryKey: ["suppliers", "list", debouncedSearch, status, page, limit],
        queryFn: () => api.get("/api/v1/suppliers", {
            page,
            limit,
            search: debouncedSearch || void 0,
            status: status || void 0
        })
    });
    const list = normalizeList(suppliers.data, limit);
    const invalidate = () => {
        void queryClient.invalidateQueries({ queryKey: ["suppliers"] });
        void queryClient.invalidateQueries({ queryKey: ["products"] });
    };
    const save = useMutation({
        mutationFn: (payload) => {
            const body = {
                name: payload.name,
                code: toNullable(payload.code ?? ""),
                contactPerson: toNullable(payload.contactPerson ?? ""),
                phone: toNullable(payload.phone ?? ""),
                email: toNullable(payload.email ?? ""),
                address: toNullable(payload.address ?? ""),
                taxId: toNullable(payload.taxId ?? ""),
                paymentTerms: toNullable(payload.paymentTerms ?? "")
            };
            return editingId ? api.put(`/api/v1/suppliers/${editingId}`, body) : api.post("/api/v1/suppliers", body);
        },
        onSuccess: () => {
            toast.success(editingId ? "Supplier updated" : "Supplier submitted for approval");
            setEditingId(null);
            setForm(EMPTY_FORM);
            invalidate();
        },
        onError: (error) => setFormError(errorMessage(error, "Could not save the supplier"))
    });
    const transition = useMutation({
        mutationFn: ({ id, action, why }) => {
            if (action === "approve" || action === "reactivate") {
                return api.post(`/api/v1/suppliers/${id}/${action}`);
            }
            const body = action === "reject" ? { rejectionReason: why } : action === "reinstate" ? {} : { reason: why };
            return api.post(`/api/v1/suppliers/${id}/${action}`, body);
        },
        onSuccess: (_data, variables) => {
            toast.success(`Supplier ${variables.action}ed`);
            setReasonTarget(null);
            setReason("");
            invalidate();
        },
        onError: (error) => toast.error(error, "Could not complete that action")
    });
    const remove = useMutation({
        mutationFn: (id) => api.delete(`/api/v1/suppliers/${id}`),
        onSuccess: () => {
            toast.success("Supplier deleted");
            invalidate();
        },
        onError: (error) => toast.error(error, "Could not delete the supplier")
    });
    const scheduleSearch = (value) => {
        setSearch(value);
        window.clearTimeout(searchTimer.current);
        searchTimer.current = window.setTimeout(() => {
            setDebouncedSearch(value);
            setPage(1);
        }, 300);
    };
    const handleSubmit = (event) => {
        event.preventDefault();
        if (!form.name.trim()) {
            setFormError("Supplier name is required.");
            return;
        }
        if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
            setFormError("Enter a valid email address.");
            return;
        }
        save.mutate(form);
    };
    const submitReason = async () => {
        if (!reasonTarget)
            return;
        if (reason.trim().length === 0)
            return;
        await transition.mutateAsync({
            id: reasonTarget.supplier.id,
            action: reasonTarget.action,
            why: reason.trim()
        });
    };
    const columns = [
        {
            key: "name",
            header: "Supplier",
            render: (supplier) => _jsxs("div", { className: "min-w-0", children: [_jsx("p", { className: "truncate font-medium text-slate-900", children: supplier.name }), _jsx("p", { className: "truncate font-mono text-xs text-slate-500", children: supplier.code ?? "\u2014" })] })
        },
        {
            key: "contact",
            header: "Contact",
            secondary: true,
            render: (supplier) => _jsxs("div", { className: "min-w-0", children: [_jsx("p", { className: "truncate text-slate-700", children: supplier.contactPerson ?? "\u2014" }), _jsx("p", { className: "truncate text-xs text-slate-500", children: supplier.email ?? supplier.phone ?? "" })] })
        },
        {
            key: "terms",
            header: "Payment terms",
            secondary: true,
            render: (supplier) => supplier.paymentTerms ?? "\u2014"
        },
        {
            key: "status",
            header: "Status",
            render: (supplier) => _jsx(StatusBadge, { status: supplier.status })
        },
        {
            key: "actions",
            header: "Actions",
            headerClassName: "text-right",
            className: "text-right",
            render: (supplier) => _jsxs("div", { className: "flex flex-wrap items-center justify-end gap-1", children: [supplier.status === "PENDING_APPROVAL" ? _jsxs(_Fragment, { children: [_jsxs(Button, { variant: "ghost", size: "sm", className: "text-emerald-600 hover:bg-emerald-50", onClick: () => transition.mutate({ id: supplier.id, action: "approve" }), disabled: transition.isPending, "aria-label": `Approve ${supplier.name}`, children: [_jsx(Check, { className: "h-3.5 w-3.5" }), "Approve"] }), _jsxs(Button, { variant: "ghost", size: "sm", className: "text-red-600 hover:bg-red-50", onClick: () => setReasonTarget({ supplier, action: "reject" }), "aria-label": `Reject ${supplier.name}`, children: [_jsx(X, { className: "h-3.5 w-3.5" }), "Reject"] })] }) : null, supplier.status === "ACTIVE" ? _jsxs(_Fragment, { children: [_jsx(Button, { variant: "ghost", size: "sm", onClick: () => {
                                    setEditingId(supplier.id);
                                    setForm({
                                        name: supplier.name,
                                        code: supplier.code ?? "",
                                        contactPerson: supplier.contactPerson ?? "",
                                        phone: supplier.phone ?? "",
                                        email: supplier.email ?? "",
                                        address: supplier.address ?? "",
                                        taxId: supplier.taxId ?? "",
                                        paymentTerms: supplier.paymentTerms ?? ""
                                    });
                                    setFormError("");
                                    window.scrollTo({ top: 0, behavior: "smooth" });
                                }, "aria-label": `Edit ${supplier.name}`, children: _jsx(Pencil, { className: "h-3.5 w-3.5" }) }), _jsx(Button, { variant: "ghost", size: "sm", className: "text-amber-600 hover:bg-amber-50", onClick: () => setReasonTarget({ supplier, action: "deactivate" }), "aria-label": `Deactivate ${supplier.name}`, children: _jsx(Ban, { className: "h-3.5 w-3.5" }) })] }) : null, supplier.status === "INACTIVE" ? _jsxs(Button, { variant: "ghost", size: "sm", className: "text-emerald-600 hover:bg-emerald-50", onClick: () => transition.mutate({ id: supplier.id, action: "reactivate" }), disabled: transition.isPending, "aria-label": `Reactivate ${supplier.name}`, children: [_jsx(Check, { className: "h-3.5 w-3.5" }), "Reactivate"] }) : null, supplier.status === "REJECTED" || supplier.status === "BLACKLISTED" ? _jsx(Button, { variant: "ghost", size: "sm", onClick: () => transition.mutate({ id: supplier.id, action: "reinstate" }), disabled: transition.isPending, "aria-label": `Reinstate ${supplier.name}`, children: "Reinstate" }) : null, supplier.status !== "BLACKLISTED" ? _jsx(Button, { variant: "ghost", size: "sm", className: "text-red-600 hover:bg-red-50", onClick: () => setReasonTarget({ supplier, action: "blacklist" }), "aria-label": `Blacklist ${supplier.name}`, children: "Blacklist" }) : null, _jsx(Button, { variant: "ghost", size: "sm", className: "text-red-600 hover:bg-red-50", onClick: () => setConfirm({
                            title: "Delete supplier",
                            message: `Permanently delete "${supplier.name}"? Products linked to this supplier may become invalid.`,
                            confirmLabel: "Delete supplier",
                            destructive: true,
                            onConfirm: async () => {
                                await remove.mutateAsync(supplier.id);
                                setConfirm(null);
                            }
                        }), "aria-label": `Delete ${supplier.name}`, children: _jsx(Trash2, { className: "h-3.5 w-3.5" }) })] })
        }
    ];
    const reasonCopy = {
        reject: {
            title: "Reject supplier",
            message: `Reject "${reasonTarget?.supplier.name}"? They will not be selectable on new products.`,
            label: "Reason for rejection",
            confirmLabel: "Reject supplier"
        },
        deactivate: {
            title: "Deactivate supplier",
            message: `Deactivate "${reasonTarget?.supplier.name}"? Existing purchase history is kept.`,
            label: "Reason for deactivation",
            confirmLabel: "Deactivate"
        },
        blacklist: {
            title: "Blacklist supplier",
            message: `Blacklist "${reasonTarget?.supplier.name}"? They will be blocked from new purchasing.`,
            label: "Reason for blacklisting",
            confirmLabel: "Blacklist"
        }
    }[reasonTarget?.action ?? "reject"];
    return _jsxs("div", { className: "space-y-5", children: [_jsx(PageHeader, { title: "Suppliers", description: `${list.total} supplier${list.total === 1 ? "" : "s"} on record` }), _jsx(Card, { children: _jsxs("form", { onSubmit: handleSubmit, className: "space-y-4", noValidate: true, children: [_jsxs("div", { className: "grid gap-4 sm:grid-cols-2 lg:grid-cols-4", children: [_jsx(Field, { label: "Supplier name", htmlFor: "supplier-name", required: true, children: _jsx(Input, { id: "supplier-name", value: form.name, onChange: (event) => setForm({ ...form, name: event.target.value }), placeholder: "Acme Supply Co." }) }), _jsx(Field, { label: "Code", htmlFor: "supplier-code", children: _jsx(Input, { id: "supplier-code", value: form.code, onChange: (event) => setForm({ ...form, code: event.target.value }), placeholder: "SUP-001" }) }), _jsx(Field, { label: "Contact person", htmlFor: "supplier-contact", children: _jsx(Input, { id: "supplier-contact", value: form.contactPerson, onChange: (event) => setForm({ ...form, contactPerson: event.target.value }), placeholder: "Jane Smith" }) }), _jsx(Field, { label: "Email", htmlFor: "supplier-email", children: _jsx(Input, { id: "supplier-email", type: "email", value: form.email, onChange: (event) => setForm({ ...form, email: event.target.value }), placeholder: "sales@acme.com" }) }), _jsx(Field, { label: "Phone", htmlFor: "supplier-phone", children: _jsx(Input, { id: "supplier-phone", value: form.phone, onChange: (event) => setForm({ ...form, phone: event.target.value }), placeholder: "+1 555 0100" }) }), _jsx(Field, { label: "Tax ID", htmlFor: "supplier-tax", children: _jsx(Input, { id: "supplier-tax", value: form.taxId, onChange: (event) => setForm({ ...form, taxId: event.target.value }), placeholder: "Optional" }) }), _jsx(Field, { label: "Payment terms", htmlFor: "supplier-terms", hint: "e.g. Net 30", children: _jsx(Input, { id: "supplier-terms", value: form.paymentTerms, onChange: (event) => setForm({ ...form, paymentTerms: event.target.value }), placeholder: "Net 30" }) }), _jsx(Field, { label: "Address", htmlFor: "supplier-address", children: _jsx(Input, { id: "supplier-address", value: form.address, onChange: (event) => setForm({ ...form, address: event.target.value }), placeholder: "Optional" }) })] }), formError ? _jsx(Alert, { tone: "danger", children: formError }) : null, _jsxs("div", { className: "flex gap-2", children: [_jsx(Button, { type: "submit", icon: _jsx(Plus, { className: "h-4 w-4" }), loading: save.isPending, children: editingId ? "Save changes" : "Add supplier" }), editingId ? _jsx(Button, { type: "button", variant: "secondary", onClick: () => {
                                        setEditingId(null);
                                        setForm(EMPTY_FORM);
                                        setFormError("");
                                    }, children: "Cancel edit" }) : null] }), _jsxs("p", { className: "text-xs text-slate-500", children: ["New suppliers start as ", _jsx("span", { className: "font-medium", children: "Pending approval" }), " and must be approved before products can reference them."] })] }) }), _jsxs(Card, { padded: false, children: [_jsxs("div", { className: "grid gap-3 border-b border-slate-200 p-4 sm:grid-cols-3", children: [_jsx(Field, { label: "Search", className: "sm:col-span-2", children: _jsxs("div", { className: "relative", children: [_jsx(Search, { className: "pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" }), _jsx(Input, { className: "pl-9", placeholder: "Name, code or contact\u2026", value: search, onChange: (event) => {
                                                scheduleSearch(event.target.value);
                                                setPage(1);
                                            } })] }) }), _jsx(Field, { label: "Status", children: _jsxs("select", { className: "input", value: status, onChange: (event) => {
                                        setStatus(event.target.value);
                                        setPage(1);
                                    }, children: [_jsx("option", { value: "", children: "All statuses" }), STATUS_OPTIONS.map((option) => _jsx("option", { value: option, children: option.replace(/_/g, " ").toLowerCase() }, option))] }) })] }), _jsx(DataTable, { columns: columns, rows: list.items, rowKey: (supplier) => supplier.id, isLoading: suppliers.isLoading, error: suppliers.error, emptyTitle: "No suppliers found", emptyDescription: "Add a supplier above to start purchasing." }), list.total > 0 ? _jsx(Pagination, { page: page, limit: limit, total: list.total, onPageChange: setPage, onLimitChange: (value) => {
                            setLimit(value);
                            setPage(1);
                        } }) : null] }), _jsxs(Modal, { open: reasonTarget !== null, onClose: () => {
                    setReasonTarget(null);
                    setReason("");
                }, title: reasonCopy.title, description: reasonCopy.message, size: "sm", footer: _jsxs(_Fragment, { children: [_jsx(Button, { variant: "secondary", onClick: () => {
                                setReasonTarget(null);
                                setReason("");
                            }, disabled: transition.isPending, children: "Cancel" }), _jsx(Button, { variant: "danger", onClick: () => void submitReason(), loading: transition.isPending, disabled: reason.trim().length === 0, children: reasonCopy.confirmLabel })] }), children: [_jsx(Field, { label: reasonCopy.label, htmlFor: "supplier-reason", required: true, children: _jsx(Textarea, { id: "supplier-reason", value: reason, onChange: (event) => setReason(event.target.value), rows: 3, placeholder: "Explain the decision\u2026", autoFocus: true }) }), transition.error ? _jsx("div", { className: "mt-3", children: _jsx(Alert, { tone: "danger", children: errorMessage(transition.error) }) }) : null] }), _jsx(ConfirmDialog, { open: confirm !== null, onClose: () => setConfirm(null), title: confirm?.title ?? "", message: confirm?.message ?? "", confirmLabel: confirm?.confirmLabel, destructive: confirm?.destructive, onConfirm: confirm?.onConfirm ?? (() => void 0), isConfirming: remove.isPending, error: remove.error })] });
}
export { SuppliersPage };
