import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDownToLine, ArrowUpFromLine, Check, Plus, X } from "lucide-react";
import { api, normalizeList } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/lib/ToastProvider";
import { formatDateTime, formatNumber, humanize } from "@/lib/format";
import { Alert, Button, Card, Field, Input, Modal, PageHeader, Select, Textarea } from "@/components/ui";
import { DataTable, Pagination } from "@/components/DataTable";
import { StatusBadge } from "@/components/StatusBadge";
const TYPE_OPTIONS = ["RECEIVED", "ISSUED", "RETURNED"];
const STATUS_OPTIONS = ["PENDING", "COMPLETED", "APPROVED", "REJECTED", "CANCELLED"];
const EMPTY_MOVEMENT = {
    productId: "",
    warehouseId: "",
    type: "received",
    quantity: "",
    referenceNumber: "",
    reason: "",
    batchNumber: ""
};
function TransactionsPage() {
    const { can } = useAuth();
    const queryClient = useQueryClient();
    const toast = useToast();
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(20);
    const [type, setType] = useState("");
    const [status, setStatus] = useState("");
    const [warehouseId, setWarehouseId] = useState("");
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [form, setForm] = useState(EMPTY_MOVEMENT);
    const [formError, setFormError] = useState("");
    const [rejectTarget, setRejectTarget] = useState(null);
    const [rejectReason, setRejectReason] = useState("");
    const transactions = useQuery({
        queryKey: ["transactions", "list", type, status, warehouseId, page, limit],
        queryFn: () => api.get("/api/v1/transactions", {
            page,
            limit,
            type: type || void 0,
            status: status || void 0,
            warehouseId: warehouseId || void 0
        })
    });
    const warehouses = useQuery({
        queryKey: ["warehouses", "all"],
        queryFn: () => api.get("/api/v1/warehouses", { limit: 100 })
    });
    const products = useQuery({
        queryKey: ["products", "options"],
        queryFn: () => api.get("/api/v1/products", { limit: 100, status: "ACTIVE" }),
        enabled: isFormOpen
    });
    const list = normalizeList(transactions.data, limit);
    const warehouseOptions = normalizeList(warehouses.data, 100).items;
    const productOptions = normalizeList(products.data, 100).items;
    const canRecord = can("receive_stock") || can("issue_stock");
    const canApprove = can("approve_transactions");
    const invalidate = () => {
        void queryClient.invalidateQueries({ queryKey: ["transactions"] });
        void queryClient.invalidateQueries({ queryKey: ["inventory"] });
        void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
        void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    };
    const createTransaction = useMutation({
        mutationFn: (payload) => api.post("/api/v1/transactions", {
            productId: payload.productId,
            warehouseId: payload.warehouseId,
            type: payload.type,
            quantity: Number(payload.quantity),
            referenceNumber: payload.referenceNumber || void 0,
            reason: payload.reason || void 0,
            batchNumber: payload.batchNumber || void 0
        }),
        onSuccess: () => {
            toast.success("Movement recorded");
            setIsFormOpen(false);
            setForm(EMPTY_MOVEMENT);
            invalidate();
        },
        onError: (error) => setFormError(error.message || "Could not record the movement")
    });
    const approve = useMutation({
        mutationFn: (id) => api.post(`/api/v1/transactions/${id}/approve`),
        onSuccess: () => {
            toast.success("Transaction approved");
            invalidate();
        },
        onError: (error) => toast.error(error, "Could not approve the transaction")
    });
    const reject = useMutation({
        mutationFn: ({ id, reason }) => api.post(`/api/v1/transactions/${id}/reject`, {
            rejectionReason: reason || void 0
        }),
        onSuccess: () => {
            toast.success("Transaction rejected");
            setRejectTarget(null);
            setRejectReason("");
            invalidate();
        },
        onError: (error) => toast.error(error, "Could not reject the transaction")
    });
    const validateAndSubmit = () => {
        if (!form.productId) {
            setFormError("Choose a product.");
            return;
        }
        if (!form.warehouseId) {
            setFormError("Choose a warehouse.");
            return;
        }
        if (!form.quantity || Number(form.quantity) <= 0) {
            setFormError("Quantity must be greater than zero.");
            return;
        }
        setFormError("");
        createTransaction.mutate(form);
    };
    const handleSubmit = (event) => {
        event.preventDefault();
        validateAndSubmit();
    };
    const columns = [
        {
            key: "date",
            header: "When",
            secondary: true,
            render: (transaction) => _jsx("span", { className: "whitespace-nowrap text-xs text-slate-500", children: formatDateTime(transaction.createdAt) })
        },
        {
            key: "product",
            header: "Product",
            render: (transaction) => _jsxs("div", { className: "min-w-0", children: [_jsx("p", { className: "truncate font-medium text-slate-900", children: transaction.product?.name ?? "\u2014" }), _jsx("p", { className: "truncate font-mono text-xs text-slate-500", children: transaction.product?.sku ?? "\u2014" })] })
        },
        {
            key: "type",
            header: "Movement",
            render: (transaction) => {
                const inbound = transaction.type === "RECEIVED" || transaction.type === "RETURNED";
                return _jsxs("span", { className: inbound ? "inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700" : "inline-flex items-center gap-1.5 text-sm font-medium text-amber-700", children: [inbound ? _jsx(ArrowDownToLine, { className: "h-3.5 w-3.5" }) : _jsx(ArrowUpFromLine, { className: "h-3.5 w-3.5" }), humanize(transaction.type)] });
            }
        },
        {
            key: "quantity",
            header: "Quantity",
            render: (transaction) => _jsx("span", { className: "tabular font-semibold text-slate-900", children: formatNumber(transaction.quantity) })
        },
        {
            key: "warehouse",
            header: "Warehouse",
            secondary: true,
            render: (transaction) => transaction.warehouse?.name ?? "\u2014"
        },
        {
            key: "performedBy",
            header: "By",
            secondary: true,
            render: (transaction) => transaction.performedBy?.fullName ?? "\u2014"
        },
        {
            key: "status",
            header: "Status",
            render: (transaction) => _jsx(StatusBadge, { status: transaction.status })
        },
        {
            key: "actions",
            header: "",
            headerClassName: "text-right",
            className: "text-right",
            render: (transaction) => canApprove && transaction.status === "PENDING" ? _jsxs("div", { className: "flex items-center justify-end gap-1", children: [_jsx(Button, { variant: "ghost", size: "sm", className: "text-emerald-600 hover:bg-emerald-50", onClick: () => approve.mutate(transaction.id), disabled: approve.isPending, "aria-label": "Approve transaction", children: _jsx(Check, { className: "h-3.5 w-3.5" }) }), _jsx(Button, { variant: "ghost", size: "sm", className: "text-red-600 hover:bg-red-50", onClick: () => setRejectTarget(transaction), "aria-label": "Reject transaction", children: _jsx(X, { className: "h-3.5 w-3.5" }) })] }) : null
        }
    ];
    return _jsxs("div", { className: "space-y-5", children: [_jsx(PageHeader, { title: "Transactions", description: "Every stock movement, with its approval state", actions: canRecord ? _jsx(Button, { icon: _jsx(Plus, { className: "h-4 w-4" }), onClick: () => setIsFormOpen(true), children: "Record movement" }) : null }), !canApprove ? _jsx(Alert, { tone: "info", children: "Movements you record are submitted for approval. Someone with the \u201CApprove Transactions\u201D permission will apply them to stock levels." }) : null, _jsxs(Card, { padded: false, children: [_jsxs("div", { className: "grid gap-3 border-b border-slate-200 p-4 sm:grid-cols-3", children: [_jsx(Field, { label: "Movement type", children: _jsxs(Select, { value: type, onChange: (event) => {
                                        setType(event.target.value);
                                        setPage(1);
                                    }, children: [_jsx("option", { value: "", children: "All types" }), TYPE_OPTIONS.map((option) => _jsx("option", { value: option, children: humanize(option) }, option))] }) }), _jsx(Field, { label: "Status", children: _jsxs(Select, { value: status, onChange: (event) => {
                                        setStatus(event.target.value);
                                        setPage(1);
                                    }, children: [_jsx("option", { value: "", children: "All statuses" }), STATUS_OPTIONS.map((option) => _jsx("option", { value: option, children: humanize(option) }, option))] }) }), _jsx(Field, { label: "Warehouse", children: _jsxs(Select, { value: warehouseId, onChange: (event) => {
                                        setWarehouseId(event.target.value);
                                        setPage(1);
                                    }, children: [_jsx("option", { value: "", children: "All warehouses" }), warehouseOptions.map((warehouse) => _jsx("option", { value: warehouse.id, children: warehouse.name }, warehouse.id))] }) })] }), _jsx(DataTable, { columns: columns, rows: list.items, rowKey: (transaction) => transaction.id, isLoading: transactions.isLoading, error: transactions.error, emptyTitle: "No transactions found", emptyDescription: "Record a movement to see it appear here." }), list.total > 0 ? _jsx(Pagination, { page: page, limit: limit, total: list.total, onPageChange: setPage, onLimitChange: (value) => {
                            setLimit(value);
                            setPage(1);
                        } }) : null] }), _jsx(Modal, { open: isFormOpen, onClose: () => setIsFormOpen(false), title: "Record a stock movement", description: "Book stock in or out of a warehouse.", footer: _jsxs(_Fragment, { children: [_jsx(Button, { variant: "secondary", onClick: () => setIsFormOpen(false), children: "Cancel" }), _jsx(Button, { onClick: validateAndSubmit, loading: createTransaction.isPending, children: "Record movement" })] }), children: _jsxs("form", { onSubmit: handleSubmit, className: "space-y-4", children: [_jsx(Field, { label: "Movement type", htmlFor: "tx-type", required: true, children: _jsxs(Select, { id: "tx-type", value: form.type, onChange: (event) => setForm({ ...form, type: event.target.value }), children: [_jsx("option", { value: "received", children: "Received \u2014 stock coming in" }), _jsx("option", { value: "issued", children: "Issued \u2014 stock going out" }), _jsx("option", { value: "returned", children: "Returned \u2014 customer return" })] }) }), _jsx(Field, { label: "Product", htmlFor: "tx-product", required: true, children: _jsxs(Select, { id: "tx-product", value: form.productId, onChange: (event) => setForm({ ...form, productId: event.target.value }), children: [_jsx("option", { value: "", children: "Select a product" }), productOptions.map((product) => _jsxs("option", { value: product.id, children: [product.name, " (", product.sku, ")"] }, product.id))] }) }), _jsx(Field, { label: "Warehouse", htmlFor: "tx-warehouse", required: true, children: _jsxs(Select, { id: "tx-warehouse", value: form.warehouseId, onChange: (event) => setForm({ ...form, warehouseId: event.target.value }), children: [_jsx("option", { value: "", children: "Select a warehouse" }), warehouseOptions.map((warehouse) => _jsx("option", { value: warehouse.id, children: warehouse.name }, warehouse.id))] }) }), _jsx(Field, { label: "Quantity", htmlFor: "tx-quantity", required: true, children: _jsx(Input, { id: "tx-quantity", type: "number", step: "0.01", min: "0.01", value: form.quantity, onChange: (event) => setForm({ ...form, quantity: event.target.value }), placeholder: "0" }) }), _jsxs("div", { className: "grid gap-4 sm:grid-cols-2", children: [_jsx(Field, { label: "Reference number", htmlFor: "tx-reference", children: _jsx(Input, { id: "tx-reference", value: form.referenceNumber, onChange: (event) => setForm({ ...form, referenceNumber: event.target.value }), placeholder: "Optional" }) }), _jsx(Field, { label: "Batch number", htmlFor: "tx-batch", children: _jsx(Input, { id: "tx-batch", value: form.batchNumber, onChange: (event) => setForm({ ...form, batchNumber: event.target.value }), placeholder: "Optional" }) })] }), _jsx(Field, { label: "Reason", htmlFor: "tx-reason", children: _jsx(Textarea, { id: "tx-reason", rows: 2, value: form.reason, onChange: (event) => setForm({ ...form, reason: event.target.value }), placeholder: "Why is this movement happening?" }) }), formError ? _jsx(Alert, { tone: "danger", children: formError }) : null] }) }), _jsxs(Modal, { open: rejectTarget !== null, onClose: () => {
                    setRejectTarget(null);
                    setRejectReason("");
                }, title: "Reject transaction", description: "The movement will not be applied to stock levels.", size: "sm", footer: _jsxs(_Fragment, { children: [_jsx(Button, { variant: "secondary", onClick: () => {
                                setRejectTarget(null);
                                setRejectReason("");
                            }, disabled: reject.isPending, children: "Cancel" }), _jsx(Button, { variant: "danger", onClick: () => rejectTarget && reject.mutate({ id: rejectTarget.id, reason: rejectReason }), loading: reject.isPending, children: "Reject transaction" })] }), children: [_jsx(Field, { label: "Reason", htmlFor: "reject-reason", hint: "Stored on the transaction for the record", children: _jsx(Textarea, { id: "reject-reason", rows: 3, value: rejectReason, onChange: (event) => setRejectReason(event.target.value), placeholder: "Optional" }) }), reject.error ? _jsx("div", { className: "mt-3", children: _jsx(Alert, { tone: "danger", children: reject.error.message }) }) : null] })] });
}
export { TransactionsPage };
