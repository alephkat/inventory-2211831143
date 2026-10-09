import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, PackageCheck, Plus, Send, Trash2, X } from "lucide-react";
import { api, normalizeList } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/lib/ToastProvider";
import { formatCurrency, formatDate, formatNumber, humanize } from "@/lib/format";
import { Alert, Button, Card, Field, Input, Modal, PageHeader, Select, Textarea } from "@/components/ui";
import { DataTable, Pagination } from "@/components/DataTable";
import { StatusBadge } from "@/components/StatusBadge";
const STATUS_OPTIONS = [
    "DRAFT",
    "PENDING",
    "APPROVED",
    "REJECTED",
    "RECEIVED",
    "PARTIALLY_RECEIVED",
    "CANCELLED"
];
const EMPTY_LINE = {
    productId: "",
    quantity: "1",
    unitPrice: "0",
    discountPercent: "0",
    taxPercent: "0"
};
const lineTotal = (line) => {
    const quantity = Number(line.quantity) || 0;
    const price = Number(line.unitPrice) || 0;
    const discount = (Number(line.discountPercent) || 0) / 100;
    const tax = (Number(line.taxPercent) || 0) / 100;
    const net = quantity * price * (1 - discount);
    return net * (1 + tax);
};
function PurchaseOrdersPage() {
    const { can } = useAuth();
    const queryClient = useQueryClient();
    const toast = useToast();
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(20);
    const [status, setStatus] = useState("");
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [createForm, setCreateForm] = useState({
        supplierId: "",
        warehouseId: "",
        expectedDate: "",
        notes: "",
        terms: ""
    });
    const [lines, setLines] = useState([{ ...EMPTY_LINE }]);
    const [createError, setCreateError] = useState("");
    const [detailId, setDetailId] = useState(null);
    const [reasonTarget, setReasonTarget] = useState(null);
    const [reason, setReason] = useState("");
    const [receiveTarget, setReceiveTarget] = useState(null);
    const [receiveLines, setReceiveLines] = useState({});
    const orders = useQuery({
        queryKey: ["purchase-orders", "list", status, page, limit],
        queryFn: () => api.get("/api/v1/purchase-orders", {
            page,
            limit,
            status: status || void 0
        })
    });
    const suppliers = useQuery({
        queryKey: ["suppliers", "all"],
        queryFn: () => api.get("/api/v1/suppliers", { limit: 100, status: "ACTIVE" }),
        enabled: isCreateOpen
    });
    const warehouses = useQuery({
        queryKey: ["warehouses", "all"],
        queryFn: () => api.get("/api/v1/warehouses", { limit: 100 })
    });
    const products = useQuery({
        queryKey: ["products", "options"],
        queryFn: () => api.get("/api/v1/products", { limit: 100, status: "ACTIVE" }),
        enabled: isCreateOpen
    });
    const detail = useQuery({
        queryKey: ["purchase-orders", "detail", detailId],
        queryFn: () => api.get(`/api/v1/purchase-orders/${detailId}`),
        enabled: detailId !== null
    });
    const list = normalizeList(orders.data, limit);
    const supplierOptions = normalizeList(suppliers.data, 100).items;
    const warehouseOptions = normalizeList(warehouses.data, 100).items;
    const productOptions = normalizeList(products.data, 100).items;
    const canManage = can("manage_purchase_orders");
    const canApprove = can("approve_transactions");
    const canReceive = can("receive_stock");
    const invalidate = () => {
        void queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
        void queryClient.invalidateQueries({ queryKey: ["inventory"] });
        void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
        void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    };
    const runAction = useMutation({
        mutationFn: ({ id, action, body }) => api.post(`/api/v1/purchase-orders/${id}/${action}`, body),
        onSuccess: (_data, variables) => {
            toast.success(`Purchase order ${variables.action}ed`);
            setReasonTarget(null);
            setReason("");
            invalidate();
        },
        onError: (error) => toast.error(error, "Could not complete that action")
    });
    const createOrder = useMutation({
        mutationFn: () => api.post("/api/v1/purchase-orders", {
            supplierId: createForm.supplierId,
            warehouseId: createForm.warehouseId,
            expectedDate: createForm.expectedDate || void 0,
            notes: createForm.notes || void 0,
            terms: createForm.terms || void 0,
            items: lines.filter((line) => line.productId).map((line) => ({
                productId: line.productId,
                quantity: Number(line.quantity),
                unitPrice: Number(line.unitPrice),
                discountPercent: Number(line.discountPercent) || 0,
                taxPercent: Number(line.taxPercent) || 0
            }))
        }),
        onSuccess: () => {
            toast.success("Purchase order created as a draft");
            setIsCreateOpen(false);
            setCreateForm({ supplierId: "", warehouseId: "", expectedDate: "", notes: "", terms: "" });
            setLines([{ ...EMPTY_LINE }]);
            invalidate();
        },
        onError: (error) => setCreateError(error.message || "Could not create the purchase order")
    });
    const removeItem = useMutation({
        mutationFn: ({ orderId, itemId }) => api.delete(`/api/v1/purchase-orders/items/${orderId}/${itemId}`),
        onSuccess: () => {
            toast.success("Line removed");
            invalidate();
        },
        onError: (error) => toast.error(error, "Could not remove the line")
    });
    const receiveStock = useMutation({
        mutationFn: () => {
            const items = Object.entries(receiveLines).map(([itemId, value]) => ({
                purchaseOrderItemId: itemId,
                receivedQuantity: Number(value.quantity) || 0,
                batchNumber: value.batchNumber || null,
                expiryDate: value.expiryDate || null
            })).filter((item) => item.receivedQuantity > 0);
            return api.post(`/api/v1/purchase-orders/${receiveTarget.id}/receive`, { items });
        },
        onSuccess: () => {
            toast.success("Stock received");
            setReceiveTarget(null);
            setReceiveLines({});
            invalidate();
        },
        onError: (error) => toast.error(error, "Could not receive this stock")
    });
    const orderTotal = useMemo(() => lines.reduce((sum, line) => sum + (line.productId ? lineTotal(line) : 0), 0), [lines]);
    const submitCreate = () => {
        const validLines = lines.filter((line) => line.productId);
        if (!createForm.supplierId) {
            setCreateError("Choose a supplier.");
            return;
        }
        if (!createForm.warehouseId) {
            setCreateError("Choose a warehouse.");
            return;
        }
        if (validLines.length === 0) {
            setCreateError("Add at least one product line.");
            return;
        }
        const invalid = validLines.some((line) => Number(line.quantity) <= 0 || Number(line.unitPrice) < 0);
        if (invalid) {
            setCreateError("Every line needs a quantity above zero and a valid unit price.");
            return;
        }
        setCreateError("");
        createOrder.mutate();
    };
    const updateLine = (index, patch) => {
        setLines((current) => current.map((line, i) => i === index ? { ...line, ...patch } : line));
    };
    const columns = [
        {
            key: "number",
            header: "Order",
            render: (order) => _jsxs("div", { className: "min-w-0", children: [_jsx("p", { className: "truncate font-mono text-sm font-medium text-slate-900", children: order.orderNumber }), _jsx("p", { className: "truncate text-xs text-slate-500", children: order.supplier?.name ?? "\u2014" })] })
        },
        {
            key: "warehouse",
            header: "Warehouse",
            secondary: true,
            render: (order) => order.warehouse?.name ?? "\u2014"
        },
        {
            key: "expected",
            header: "Expected",
            secondary: true,
            render: (order) => formatDate(order.expectedDate)
        },
        {
            key: "total",
            header: "Total",
            render: (order) => _jsx("span", { className: "tabular font-semibold text-slate-900", children: formatCurrency(order.totalAmount) })
        },
        {
            key: "status",
            header: "Status",
            render: (order) => _jsx(StatusBadge, { status: order.status })
        },
        {
            key: "actions",
            header: "Actions",
            headerClassName: "text-right",
            className: "text-right",
            render: (order) => _jsxs("div", { className: "flex flex-wrap items-center justify-end gap-1", children: [_jsx(Button, { variant: "ghost", size: "sm", onClick: () => setDetailId(order.id), children: "View" }), canApprove && order.status === "DRAFT" ? _jsxs(Button, { variant: "ghost", size: "sm", onClick: () => runAction.mutate({ id: order.id, action: "submit" }), disabled: runAction.isPending, children: [_jsx(Send, { className: "h-3.5 w-3.5" }), "Submit"] }) : null, canApprove && order.status === "PENDING" ? _jsxs(_Fragment, { children: [_jsxs(Button, { variant: "ghost", size: "sm", className: "text-emerald-600 hover:bg-emerald-50", onClick: () => runAction.mutate({ id: order.id, action: "approve" }), disabled: runAction.isPending, children: [_jsx(Check, { className: "h-3.5 w-3.5" }), "Approve"] }), _jsxs(Button, { variant: "ghost", size: "sm", className: "text-red-600 hover:bg-red-50", onClick: () => setReasonTarget({ order, action: "reject" }), children: [_jsx(X, { className: "h-3.5 w-3.5" }), "Reject"] })] }) : null, canReceive && (order.status === "APPROVED" || order.status === "PARTIALLY_RECEIVED") ? _jsxs(Button, { variant: "ghost", size: "sm", className: "text-brand-600 hover:bg-brand-50", onClick: () => {
                            setReceiveTarget(order);
                            setReceiveLines({});
                        }, children: [_jsx(PackageCheck, { className: "h-3.5 w-3.5" }), "Receive"] }) : null, canManage && !["COMPLETED", "CANCELLED", "RECEIVED"].includes(order.status) ? _jsx(Button, { variant: "ghost", size: "sm", className: "text-red-600 hover:bg-red-50", onClick: () => setReasonTarget({ order, action: "cancel" }), children: "Cancel" }) : null] })
        }
    ];
    const detailItems = detail.data?.items ?? [];
    return _jsxs("div", { className: "space-y-5", children: [_jsx(PageHeader, { title: "Purchase orders", description: `${list.total} order${list.total === 1 ? "" : "s"} on record`, actions: canManage ? _jsx(Button, { icon: _jsx(Plus, { className: "h-4 w-4" }), onClick: () => setIsCreateOpen(true), children: "New purchase order" }) : null }), _jsxs(Card, { padded: false, children: [_jsx("div", { className: "border-b border-slate-200 p-4", children: _jsx(Field, { label: "Status", className: "max-w-xs", children: _jsxs(Select, { value: status, onChange: (event) => {
                                    setStatus(event.target.value);
                                    setPage(1);
                                }, children: [_jsx("option", { value: "", children: "All statuses" }), STATUS_OPTIONS.map((option) => _jsx("option", { value: option, children: humanize(option) }, option))] }) }) }), _jsx(DataTable, { columns: columns, rows: list.items, rowKey: (order) => order.id, isLoading: orders.isLoading, error: orders.error, emptyTitle: "No purchase orders", emptyDescription: "Create an order to request stock from a supplier.", emptyAction: canManage ? _jsx(Button, { icon: _jsx(Plus, { className: "h-4 w-4" }), onClick: () => setIsCreateOpen(true), children: "New purchase order" }) : null }), list.total > 0 ? _jsx(Pagination, { page: page, limit: limit, total: list.total, onPageChange: setPage, onLimitChange: (value) => {
                            setLimit(value);
                            setPage(1);
                        } }) : null] }), _jsx(Modal, { open: isCreateOpen, onClose: () => setIsCreateOpen(false), title: "New purchase order", description: "Orders start as a draft. Submit them for approval when ready.", size: "xl", footer: _jsxs(_Fragment, { children: [_jsx(Button, { variant: "secondary", onClick: () => setIsCreateOpen(false), children: "Cancel" }), _jsx(Button, { onClick: submitCreate, loading: createOrder.isPending, children: "Create draft" })] }), children: _jsxs("div", { className: "space-y-4", children: [_jsxs("div", { className: "grid gap-4 sm:grid-cols-2 lg:grid-cols-4", children: [_jsx(Field, { label: "Supplier", htmlFor: "po-supplier", required: true, children: _jsxs(Select, { id: "po-supplier", value: createForm.supplierId, onChange: (event) => setCreateForm({ ...createForm, supplierId: event.target.value }), children: [_jsx("option", { value: "", children: "Select a supplier" }), supplierOptions.map((supplier) => _jsx("option", { value: supplier.id, children: supplier.name }, supplier.id))] }) }), _jsx(Field, { label: "Warehouse", htmlFor: "po-warehouse", required: true, children: _jsxs(Select, { id: "po-warehouse", value: createForm.warehouseId, onChange: (event) => setCreateForm({ ...createForm, warehouseId: event.target.value }), children: [_jsx("option", { value: "", children: "Select a warehouse" }), warehouseOptions.map((warehouse) => _jsx("option", { value: warehouse.id, children: warehouse.name }, warehouse.id))] }) }), _jsx(Field, { label: "Expected date", htmlFor: "po-expected", children: _jsx(Input, { id: "po-expected", type: "date", value: createForm.expectedDate, onChange: (event) => setCreateForm({ ...createForm, expectedDate: event.target.value }) }) }), _jsx(Field, { label: "Terms", htmlFor: "po-terms", hint: "e.g. Net 30", children: _jsx(Input, { id: "po-terms", value: createForm.terms, onChange: (event) => setCreateForm({ ...createForm, terms: event.target.value }), placeholder: "Optional" }) })] }), _jsxs("div", { children: [_jsxs("div", { className: "mb-2 flex items-center justify-between", children: [_jsx("p", { className: "text-sm font-medium text-slate-700", children: "Order lines" }), _jsx(Button, { variant: "secondary", size: "sm", icon: _jsx(Plus, { className: "h-3.5 w-3.5" }), onClick: () => setLines((current) => [...current, { ...EMPTY_LINE }]), children: "Add line" })] }), _jsx("div", { className: "space-y-2", children: lines.map((line, index) => _jsxs("div", { className: "grid gap-2 rounded-lg border border-slate-200 p-3 sm:grid-cols-12", children: [_jsx(Field, { label: "Product", className: "sm:col-span-4", htmlFor: `po-line-product-${index}`, children: _jsxs(Select, { id: `po-line-product-${index}`, value: line.productId, onChange: (event) => {
                                                        const product = productOptions.find((p) => p.id === event.target.value);
                                                        updateLine(index, {
                                                            productId: event.target.value,
                                                            // Default the price to the product's cost so the
                                                            // common case is one click, not five keystrokes.
                                                            unitPrice: product ? String(product.costPrice) : line.unitPrice
                                                        });
                                                    }, children: [_jsx("option", { value: "", children: "Select a product" }), productOptions.map((product) => _jsxs("option", { value: product.id, children: [product.name, " (", product.sku, ")"] }, product.id))] }) }), _jsx(Field, { label: "Qty", className: "sm:col-span-2", htmlFor: `po-line-qty-${index}`, children: _jsx(Input, { id: `po-line-qty-${index}`, type: "number", step: "0.01", min: "0", value: line.quantity, onChange: (event) => updateLine(index, { quantity: event.target.value }) }) }), _jsx(Field, { label: "Unit price", className: "sm:col-span-2", htmlFor: `po-line-price-${index}`, children: _jsx(Input, { id: `po-line-price-${index}`, type: "number", step: "0.01", min: "0", prefix: "$", value: line.unitPrice, onChange: (event) => updateLine(index, { unitPrice: event.target.value }) }) }), _jsx(Field, { label: "Disc %", className: "sm:col-span-1", htmlFor: `po-line-disc-${index}`, children: _jsx(Input, { id: `po-line-disc-${index}`, type: "number", step: "0.01", min: "0", max: "100", value: line.discountPercent, onChange: (event) => updateLine(index, { discountPercent: event.target.value }) }) }), _jsx(Field, { label: "Tax %", className: "sm:col-span-1", htmlFor: `po-line-tax-${index}`, children: _jsx(Input, { id: `po-line-tax-${index}`, type: "number", step: "0.01", min: "0", max: "100", value: line.taxPercent, onChange: (event) => updateLine(index, { taxPercent: event.target.value }) }) }), _jsx("div", { className: "flex items-end sm:col-span-2", children: _jsxs("div", { className: "flex w-full items-center justify-between gap-2", children: [_jsx("span", { className: "tabular text-sm font-semibold text-slate-900", children: formatCurrency(lineTotal(line)) }), _jsx(Button, { variant: "ghost", size: "sm", className: "text-red-600 hover:bg-red-50", disabled: lines.length === 1, onClick: () => setLines((current) => current.filter((_, i) => i !== index)), "aria-label": `Remove line ${index + 1}`, children: _jsx(Trash2, { className: "h-3.5 w-3.5" }) })] }) })] }, index)) }), _jsx("div", { className: "mt-3 flex justify-end border-t border-slate-200 pt-3", children: _jsxs("p", { className: "text-sm text-slate-600", children: ["Order total:", " ", _jsx("span", { className: "tabular text-base font-semibold text-slate-900", children: formatCurrency(orderTotal) })] }) })] }), _jsx(Field, { label: "Notes", htmlFor: "po-notes", children: _jsx(Textarea, { id: "po-notes", rows: 2, value: createForm.notes, onChange: (event) => setCreateForm({ ...createForm, notes: event.target.value }), placeholder: "Delivery instructions, PO references\u2026" }) }), createError ? _jsx(Alert, { tone: "danger", children: createError }) : null] }) }), _jsx(Modal, { open: detailId !== null, onClose: () => setDetailId(null), title: detail.data?.orderNumber ?? "Purchase order", description: detail.data ? `${detail.data.supplier?.name ?? "Supplier"} \xB7 ${detail.data.warehouse?.name ?? ""}` : void 0, size: "xl", footer: _jsx(Button, { variant: "secondary", onClick: () => setDetailId(null), children: "Close" }), children: !detail.data ? _jsx("p", { className: "py-8 text-center text-sm text-slate-500", children: "Loading\u2026" }) : _jsxs("div", { className: "space-y-4", children: [_jsxs("div", { className: "flex flex-wrap items-center gap-3", children: [_jsx(StatusBadge, { status: detail.data.status }), _jsx("span", { className: "tabular text-sm font-semibold text-slate-900", children: formatCurrency(detail.data.totalAmount) }), detail.data.expectedDate ? _jsxs("span", { className: "text-xs text-slate-500", children: ["Expected ", formatDate(detail.data.expectedDate)] }) : null] }), detail.data.rejectionReason ? _jsxs(Alert, { tone: "danger", children: ["Rejected: ", detail.data.rejectionReason] }) : null, detail.data.notes ? _jsx("p", { className: "rounded-lg bg-slate-50 p-3 text-sm text-slate-600", children: detail.data.notes }) : null, _jsx("div", { className: "overflow-x-auto", children: _jsxs("table", { className: "w-full", children: [_jsx("thead", { className: "border-b border-slate-200 bg-slate-50", children: _jsxs("tr", { children: [_jsx("th", { className: "th", children: "Product" }), _jsx("th", { className: "th text-right", children: "Ordered" }), _jsx("th", { className: "th text-right", children: "Received" }), _jsx("th", { className: "th text-right", children: "Unit price" }), _jsx("th", { className: "th text-right", children: "Total" }), canManage && detail.data.status === "DRAFT" ? _jsx("th", { className: "th" }) : null] }) }), _jsx("tbody", { className: "divide-y divide-slate-100", children: detailItems.map((item) => _jsxs("tr", { children: [_jsxs("td", { className: "td", children: [_jsx("p", { className: "font-medium text-slate-900", children: item.product?.name }), _jsx("p", { className: "font-mono text-xs text-slate-500", children: item.product?.sku })] }), _jsx("td", { className: "td tabular text-right", children: formatNumber(item.quantity) }), _jsx("td", { className: "td tabular text-right", children: formatNumber(item.receivedQuantity) }), _jsx("td", { className: "td tabular text-right", children: formatCurrency(item.unitPrice) }), _jsx("td", { className: "td tabular text-right font-medium", children: formatCurrency(item.totalPrice) }), canManage && detail.data?.status === "DRAFT" ? _jsx("td", { className: "td text-right", children: _jsx(Button, { variant: "ghost", size: "sm", className: "text-red-600 hover:bg-red-50", onClick: () => removeItem.mutate({ orderId: detail.data.id, itemId: item.id }), "aria-label": `Remove ${item.product?.name}`, children: _jsx(Trash2, { className: "h-3.5 w-3.5" }) }) }) : null] }, item.id)) })] }) }), _jsx("div", { className: "flex justify-end border-t border-slate-200 pt-3 text-sm", children: _jsxs("dl", { className: "w-56 space-y-1", children: [_jsxs("div", { className: "flex justify-between", children: [_jsx("dt", { className: "text-slate-500", children: "Subtotal" }), _jsx("dd", { className: "tabular", children: formatCurrency(detail.data.subtotal) })] }), _jsxs("div", { className: "flex justify-between", children: [_jsx("dt", { className: "text-slate-500", children: "Discount" }), _jsxs("dd", { className: "tabular", children: ["\u2212", formatCurrency(detail.data.discountAmount)] })] }), _jsxs("div", { className: "flex justify-between", children: [_jsx("dt", { className: "text-slate-500", children: "Tax" }), _jsx("dd", { className: "tabular", children: formatCurrency(detail.data.taxAmount) })] }), _jsxs("div", { className: "flex justify-between border-t border-slate-200 pt-1 font-semibold", children: [_jsx("dt", { children: "Total" }), _jsx("dd", { className: "tabular", children: formatCurrency(detail.data.totalAmount) })] })] }) })] }) }), _jsxs(Modal, { open: reasonTarget !== null, onClose: () => {
                    setReasonTarget(null);
                    setReason("");
                }, title: reasonTarget?.action === "reject" ? "Reject purchase order" : "Cancel purchase order", description: reasonTarget?.action === "reject" ? `Reject ${reasonTarget?.order.orderNumber}? The supplier will be asked for a revision.` : `Cancel ${reasonTarget?.order.orderNumber}? This cannot be undone.`, size: "sm", footer: _jsxs(_Fragment, { children: [_jsx(Button, { variant: "secondary", onClick: () => {
                                setReasonTarget(null);
                                setReason("");
                            }, disabled: runAction.isPending, children: "Back" }), _jsx(Button, { variant: "danger", loading: runAction.isPending, onClick: () => reasonTarget && runAction.mutate(reasonTarget.action === "reject" ? { id: reasonTarget.order.id, action: "reject", body: { rejectionReason: reason || void 0 } } : { id: reasonTarget.order.id, action: "cancel", body: { reason: reason || void 0 } }), children: reasonTarget?.action === "reject" ? "Reject order" : "Cancel order" })] }), children: [_jsx(Field, { label: "Reason", htmlFor: "po-reason", hint: reasonTarget?.action === "reject" ? "Optional" : "Recommended for the audit trail", children: _jsx(Textarea, { id: "po-reason", rows: 3, value: reason, onChange: (event) => setReason(event.target.value), autoFocus: true }) }), runAction.error ? _jsx("div", { className: "mt-3", children: _jsx(Alert, { tone: "danger", children: runAction.error.message }) }) : null] }), _jsx(Modal, { open: receiveTarget !== null, onClose: () => {
                    setReceiveTarget(null);
                    setReceiveLines({});
                }, title: `Receive ${receiveTarget?.orderNumber ?? "stock"}`, description: "Enter what physically arrived. Leave blank to skip a line.", size: "lg", footer: _jsxs(_Fragment, { children: [_jsx(Button, { variant: "secondary", onClick: () => {
                                setReceiveTarget(null);
                                setReceiveLines({});
                            }, disabled: receiveStock.isPending, children: "Cancel" }), _jsx(Button, { onClick: () => {
                                if (receiveTarget)
                                    receiveStock.mutate();
                            }, loading: receiveStock.isPending, disabled: !Object.values(receiveLines).some((value) => Number(value.quantity) > 0), children: "Confirm receipt" })] }), children: _jsxs("div", { className: "space-y-3", children: [(receiveTarget?.items ?? []).map((item) => {
                            const outstanding = item.quantity - item.receivedQuantity;
                            if (outstanding <= 0)
                                return null;
                            const value = receiveLines[item.id] ?? {
                                quantity: "",
                                batchNumber: "",
                                expiryDate: ""
                            };
                            return _jsxs("div", { className: "rounded-lg border border-slate-200 p-3", children: [_jsxs("div", { className: "mb-2 flex items-center justify-between gap-2", children: [_jsx("p", { className: "text-sm font-medium text-slate-900", children: item.product?.name }), _jsxs("p", { className: "tabular shrink-0 text-xs text-slate-500", children: [formatNumber(item.receivedQuantity), " of ", formatNumber(item.quantity), " received"] })] }), _jsxs("div", { className: "grid gap-2 sm:grid-cols-3", children: [_jsx(Field, { label: "Receiving now", htmlFor: `recv-qty-${item.id}`, children: _jsx(Input, { id: `recv-qty-${item.id}`, type: "number", step: "0.01", min: "0", max: outstanding, value: value.quantity, onChange: (event) => setReceiveLines((current) => ({
                                                        ...current,
                                                        [item.id]: { ...value, quantity: event.target.value }
                                                    })), placeholder: "0" }) }), _jsx(Field, { label: "Batch", htmlFor: `recv-batch-${item.id}`, children: _jsx(Input, { id: `recv-batch-${item.id}`, value: value.batchNumber, onChange: (event) => setReceiveLines((current) => ({
                                                        ...current,
                                                        [item.id]: { ...value, batchNumber: event.target.value }
                                                    })), placeholder: "Optional" }) }), _jsx(Field, { label: "Expiry", htmlFor: `recv-exp-${item.id}`, children: _jsx(Input, { id: `recv-exp-${item.id}`, type: "date", value: value.expiryDate, onChange: (event) => setReceiveLines((current) => ({
                                                        ...current,
                                                        [item.id]: { ...value, expiryDate: event.target.value }
                                                    })) }) })] })] }, item.id);
                        }), receiveStock.error ? _jsx(Alert, { tone: "danger", children: receiveStock.error.message }) : null] }) })] });
}
export { PurchaseOrdersPage };
