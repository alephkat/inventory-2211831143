import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FolderTree, Pencil, Plus, Trash2 } from "lucide-react";
import { api, normalizeList } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/lib/ToastProvider";
import { errorMessage } from "@/lib/format";
import { Badge, Button, Card, Field, Input, PageHeader, Alert } from "@/components/ui";
import { ConfirmDialog } from "@/components/feedback";
import { DataTable } from "@/components/DataTable";
const EMPTY_FORM = { name: "", description: "", parentId: "" };
function CategoriesPage() {
    const queryClient = useQueryClient();
    const toast = useToast();
    const { can } = useAuth();
    const [form, setForm] = useState(EMPTY_FORM);
    const [editingId, setEditingId] = useState(null);
    const [formError, setFormError] = useState("");
    const [confirm, setConfirm] = useState(null);
    const categories = useQuery({
        queryKey: ["categories", "all"],
        queryFn: () => api.get("/api/v1/categories", { limit: 100 })
    });
    const list = normalizeList(categories.data, 100).items;
    const canManage = can("manage_categories");
    const openCreate = () => {
        setEditingId(null);
        setForm(EMPTY_FORM);
        setFormError("");
    };
    const openEdit = (category) => {
        setEditingId(category.id);
        setForm({
            name: category.name,
            description: category.description ?? "",
            // A category cannot be its own parent, so the current row is excluded
            // from the options.
            parentId: category.parentId ?? ""
        });
        setFormError("");
    };
    const save = useMutation({
        mutationFn: (payload) => editingId ? api.put(`/api/v1/categories/${editingId}`, {
            name: payload.name,
            description: payload.description || void 0,
            parentId: payload.parentId || null
        }) : api.post("/api/v1/categories", {
            name: payload.name,
            description: payload.description || void 0,
            parentId: payload.parentId || null
        }),
        onSuccess: () => {
            toast.success(editingId ? "Category updated" : "Category created");
            setEditingId(null);
            setForm(EMPTY_FORM);
            void queryClient.invalidateQueries({ queryKey: ["categories"] });
        },
        onError: (error) => setFormError(errorMessage(error, "Could not save the category"))
    });
    const remove = useMutation({
        mutationFn: (id) => api.delete(`/api/v1/categories/${id}`),
        onSuccess: () => {
            toast.success("Category deleted");
            void queryClient.invalidateQueries({ queryKey: ["categories"] });
            void queryClient.invalidateQueries({ queryKey: ["products"] });
        },
        onError: (error) => toast.error(error, "Could not delete the category")
    });
    const handleSubmit = (event) => {
        event.preventDefault();
        if (!form.name.trim()) {
            setFormError("Category name is required.");
            return;
        }
        save.mutate(form);
    };
    const parentName = (parentId) => parentId ? list.find((category) => category.id === parentId)?.name ?? "\u2014" : null;
    const columns = [
        {
            key: "name",
            header: "Category",
            render: (category) => _jsxs("div", { className: "min-w-0", children: [_jsx("p", { className: "truncate font-medium text-slate-900", children: category.name }), category.description ? _jsx("p", { className: "truncate text-xs text-slate-500", children: category.description }) : null] })
        },
        {
            key: "parent",
            header: "Parent",
            secondary: true,
            render: (category) => parentName(category.parentId) ?? _jsx("span", { className: "text-slate-400", children: "\u2014" })
        },
        {
            key: "status",
            header: "Status",
            secondary: true,
            render: (category) => _jsx(Badge, { tone: category.isActive ? "success" : "neutral", children: category.isActive ? "Active" : "Inactive" })
        },
        {
            key: "actions",
            header: "",
            headerClassName: "text-right",
            className: "text-right",
            render: (category) => canManage ? _jsxs("div", { className: "flex items-center justify-end gap-1", children: [_jsx(Button, { variant: "ghost", size: "sm", onClick: () => openEdit(category), "aria-label": `Edit ${category.name}`, children: _jsx(Pencil, { className: "h-3.5 w-3.5" }) }), _jsx(Button, { variant: "ghost", size: "sm", className: "text-red-600 hover:bg-red-50", onClick: () => setConfirm({
                            title: "Delete category",
                            message: `Delete "${category.name}"? Products in this category must be reassigned first.`,
                            confirmLabel: "Delete category",
                            destructive: true,
                            onConfirm: async () => {
                                await remove.mutateAsync(category.id);
                                setConfirm(null);
                            }
                        }), "aria-label": `Delete ${category.name}`, children: _jsx(Trash2, { className: "h-3.5 w-3.5" }) })] }) : null
        }
    ];
    return _jsxs("div", { className: "space-y-5", children: [_jsx(PageHeader, { title: "Categories", description: "Group products so reporting and filtering stay meaningful", actions: canManage ? _jsx(Button, { icon: _jsx(Plus, { className: "h-4 w-4" }), onClick: () => {
                        openCreate();
                        document.getElementById("category-form")?.scrollIntoView({ behavior: "smooth" });
                    }, children: "New category" }) : null }), canManage ? _jsx(Card, { children: _jsxs("form", { id: "category-form", onSubmit: handleSubmit, className: "space-y-4", noValidate: true, children: [_jsxs("div", { className: "grid gap-4 sm:grid-cols-2 lg:grid-cols-3", children: [_jsx(Field, { label: "Name", htmlFor: "category-name", required: true, children: _jsx(Input, { id: "category-name", value: form.name, onChange: (event) => setForm({ ...form, name: event.target.value }), placeholder: "Electronics" }) }), _jsx(Field, { label: "Parent category", htmlFor: "category-parent", children: _jsxs("select", { id: "category-parent", className: "input", value: form.parentId, onChange: (event) => setForm({ ...form, parentId: event.target.value }), children: [_jsx("option", { value: "", children: "None (top level)" }), list.filter((category) => category.id !== editingId).map((category) => _jsx("option", { value: category.id, children: category.name }, category.id))] }) }), _jsx(Field, { label: "Description", htmlFor: "category-description", className: "sm:col-span-2 lg:col-span-1", children: _jsx(Input, { id: "category-description", value: form.description, onChange: (event) => setForm({ ...form, description: event.target.value }), placeholder: "Optional" }) })] }), formError ? _jsx(Alert, { tone: "danger", children: formError }) : null, _jsxs("div", { className: "flex gap-2", children: [_jsx(Button, { type: "submit", loading: save.isPending, children: editingId ? "Save changes" : "Add category" }), editingId ? _jsx(Button, { type: "button", variant: "secondary", onClick: openCreate, children: "Cancel edit" }) : null] })] }) }) : _jsx(Alert, { tone: "info", children: "You have read-only access to categories. Ask an administrator for the \u201CManage Categories\u201D permission to make changes." }), _jsx(Card, { padded: false, children: _jsx(DataTable, { columns: columns, rows: list, rowKey: (category) => category.id, isLoading: categories.isLoading, error: categories.error, emptyTitle: "No categories yet", emptyDescription: "Create a category to organise your product catalog.", emptyAction: canManage ? _jsx(Button, { icon: _jsx(FolderTree, { className: "h-4 w-4" }), onClick: () => {
                            openCreate();
                            document.getElementById("category-form")?.scrollIntoView({ behavior: "smooth" });
                        }, children: "New category" }) : null }) }), _jsx(ConfirmDialog, { open: confirm !== null, onClose: () => setConfirm(null), title: confirm?.title ?? "", message: confirm?.message ?? "", confirmLabel: confirm?.confirmLabel, destructive: confirm?.destructive, onConfirm: confirm?.onConfirm ?? (() => void 0), isConfirming: remove.isPending, error: remove.error })] });
}
export { CategoriesPage };
