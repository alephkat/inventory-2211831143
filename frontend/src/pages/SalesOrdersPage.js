import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, PackageMinus, Plus, Send, Trash2, Truck } from "lucide-react";
import { api, normalizeList } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/lib/ToastProvider";
import { formatCurrency, formatDate, formatNumber, humanize } from "@/lib/format";
import { Alert, Button, Card, Field, Input, Modal, PageHeader, Select } from "@/components/ui";
import { DataTable, Pagination } from "@/components/DataTable";
import { StatusBadge } from "@/components/StatusBadge";
const STATUS_OPTIONS = [
    "DRAFT",
    "PENDING",
    "APPROVED",
    "REJECTED",
    "ISSUED",
    "COMPLETED",
    "CANCELLED"
];
const EMPTY_LINE = { productId: "", quantity: "1", unitPrice: "0" };
const lineTotal = (line) => (Number(line.quantity) || 0) * (Number(line.unitPrice) || 0);
function SalesOrdersPage() {
    const { can } = useAuth();
    const queryClient = useQueryClient();
    const toast = useToast();
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(20);
    const [status, setStatus] = useState("");
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [createForm, setCreateForm] = useState({
        customerId: "",
        warehouseId: "",
        expectedDate: ""
    });
    const [lines, setLines] = useState([{ ...EMPTY_LINE }]);
    const [createError, setCreateError] = useState("");
    const [detailId, setDetailId] = useState(null);
    const [issueTarget, setIssueTarget] = useState(null);
    const [issueLines, setIssueLines] = useState({});
    const orders = useQuery({
        queryKey: ["sales-orders", "list", status, page, limit],
        queryFn: () => api.get("/api/v1/sales-orders", { page, limit, status: status || void 0 })
    });
    const customers = useQuery({
        queryKey: ["customers", "all"],
        queryFn: () => api.get("/api/v1/customers", { limit: 100 }),
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
        queryKey: ["sales-orders", "detail", detailId],
        queryFn: () => api.get(`/api/v1/sales-orders/${detailId}`),
        enabled: detailId !== null
    });
    const list = normalizeList(orders.data, limit);
    const customerOptions = normalizeList(customers.data, 100).items;
    const warehouseOptions = normalizeList(warehouses.data, 100).items;
    const productOptions = normalizeList(products.data, 100).items;
    const canManage = can("manage_sales_orders");
    const canApprove = can("approve_transactions");
    const canIssue = can("issue_stock");
    const invalidate = () => {
        void queryClient.invalidateQueries({ queryKey: ["sales-orders"] });
        void queryClient.invalidateQueries({ queryKey: ["inventory"] });
        void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
        void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    };
    const runAction = useMutation({
        mutationFn: ({ id, action }) => api.post(`/api/v1/sales-orders/${id}/${action}`),
        onSuccess: (_data, variables) => {
            toast.success(`Sales order ${variables.action}ed`);
            invalidate();
        },
        onError: (error) => toast.error(error, "Could not complete that action")
    });
    const issueStock = useMutation({
        mutationFn: () => api.post(`/api/v1/sales-orders/${issueTarget.id}/issue`, {
            items: Object.entries(issueLines).map(([itemId, quantity]) => ({ itemId, quantity: Number(quantity) || 0 })).filter((item) => item.quantity > 0)
        }),
        onSuccess: () => {
            toast.success("Stock issued");
            setIssueTarget(null);
            setIssueLines({});
            invalidate();
        },
        onError: (error) => toast.error(error, "Could not issue this stock")
    });
    const createOrder = useMutation({
        mutationFn: () => api.post("/api/v1/sales-orders", {
            customerId: createForm.customerId,
            warehouseId: createForm.warehouseId,
            expectedDate: createForm.expectedDate || void 0,
            items: lines.filter((line) => line.productId).map((line) => ({
                productId: line.productId,
                quantity: Number(line.quantity),
                unitPrice: Number(line.unitPrice)
            }))
        }),
        onSuccess: () => {
            toast.success("Sales order created as a draft");
            setIsCreateOpen(false);
            setCreateForm({ customerId: "", warehouseId: "", expectedDate: "" });
            setLines([{ ...EMPTY_LINE }]);
            invalidate();
        },
        onError: (error) => setCreateError(error.message || "Could not create the sales order")
    });
    const orderTotal = useMemo(() => lines.reduce((sum, line) => sum + (line.productId ? lineTotal(line) : 0), 0), [lines]);
    const submitCreate = () => {
        const validLines = lines.filter((line) => line.productId);
        if (!createForm.customerId) {
            setCreateError("Choose a customer.");
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
        if (validLines.some((line) => Number(line.quantity) <= 0 || Number(line.unitPrice) < 0)) {
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
            render: (order) => _jsxs("div", { className: "min-w-0", children: [_jsx("p", { className: "truncate font-mono text-sm font-medium text-slate-900", children: order.orderNumber }), _jsx("p", { className: "truncate text-xs text-slate-500", children: order.customer?.name ?? "\u2014" })] })
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
            render: (order) => _jsxs("div", { className: "flex flex-wrap items-center justify-end gap-1", children: [_jsx(Button, { variant: "ghost", size: "sm", onClick: () => setDetailId(order.id), children: "View" }), canApprove && order.status === "DRAFT" ? _jsxs(Button, { variant: "ghost", size: "sm", onClick: () => runAction.mutate({ id: order.id, action: "submit" }), disabled: runAction.isPending, children: [_jsx(Send, { className: "h-3.5 w-3.5" }), "Submit"] }) : null, canApprove && order.status === "PENDING" ? _jsxs(Button, { variant: "ghost", size: "sm", className: "text-emerald-600 hover:bg-emerald-50", onClick: () => runAction.mutate({ id: order.id, action: "approve" }), disabled: runAction.isPending, children: [_jsx(Check, { className: "h-3.5 w-3.5" }), "Approve"] }) : null, canIssue && order.status === "APPROVED" ? _jsxs(Button, { variant: "ghost", size: "sm", className: "text-brand-600 hover:bg-brand-50", onClick: () => {
                            setIssueTarget(order);
                            setIssueLines({});
                        }, children: [_jsx(PackageMinus, { className: "h-3.5 w-3.5" }), "Issue"] }) : null, canManage && (order.status === "ISSUED" || order.status === "APPROVED") ? _jsxs(Button, { variant: "ghost", size: "sm", onClick: () => runAction.mutate({ id: order.id, action: "deliver" }), disabled: runAction.isPending, children: [_jsx(Truck, { className: "h-3.5 w-3.5" }), "Deliver"] }) : null, canManage && !["COMPLETED", "CANCELLED"].includes(order.status) ? _jsx(Button, { variant: "ghost", size: "sm", className: "text-red-600 hover:bg-red-50", onClick: () => runAction.mutate({ id: order.id, action: "cancel" }), disabled: runAction.isPending, children: "Cancel" }) : null] })
        }
    ];
    const detailItems = detail.data?.items ?? [];
    return _jsxs("div", { className: "space-y-5", children: [_jsx(PageHeader, { title: "Sales orders", description: `${list.total} order${list.total === 1 ? "" : "s"} on record`, actions: canManage ? _jsx(Button, { icon: _jsx(Plus, { className: "h-4 w-4" }), onClick: () => setIsCreateOpen(true), children: "New sales order" }) : null }), _jsxs(Card, { padded: false, children: [_jsx("div", { className: "border-b border-slate-200 p-4", children: _jsx(Field, { label: "Status", className: "max-w-xs", children: _jsxs(Select, { value: status, onChange: (event) => {
                                    setStatus(event.target.value);
                                    setPage(1);
                                }, children: [_jsx("option", { value: "", children: "All statuses" }), STATUS_OPTIONS.map((option) => _jsx("option", { value: option, children: humanize(option) }, option))] }) }) }), _jsx(DataTable, { columns: columns, rows: list.items, rowKey: (order) => order.id, isLoading: orders.isLoading, error: orders.error, emptyTitle: "No sales orders", emptyDescription: "Create an order to record stock leaving for a customer.", emptyAction: canManage ? _jsx(Button, { icon: _jsx(Plus, { className: "h-4 w-4" }), onClick: () => setIsCreateOpen(true), children: "New sales order" }) : null }), list.total > 0 ? _jsx(Pagination, { page: page, limit: limit, total: list.total, onPageChange: setPage, onLimitChange: (value) => {
                            setLimit(value);
                            setPage(1);
                        } }) : null] }), _jsx(Modal, { open: isCreateOpen, onClose: () => setIsCreateOpen(false), title: "New sales order", description: "Orders start as a draft. Submit them for approval when ready.", size: "lg", footer: _jsxs(_Fragment, { children: [_jsx(Button, { variant: "secondary", onClick: () => setIsCreateOpen(false), children: "Cancel" }), _jsx(Button, { onClick: submitCreate, loading: createOrder.isPending, children: "Create draft" })] }), children: _jsxs("div", { className: "space-y-4", children: [_jsxs("div", { className: "grid gap-4 sm:grid-cols-3", children: [_jsx(Field, { label: "Customer", htmlFor: "so-customer", required: true, children: _jsxs(Select, { id: "so-customer", value: createForm.customerId, onChange: (event) => setCreateForm({ ...createForm, customerId: event.target.value }), children: [_jsx("option", { value: "", children: "Select a customer" }), customerOptions.map((customer) => _jsx("option", { value: customer.id, children: customer.name }, customer.id))] }) }), _jsx(Field, { label: "Warehouse", htmlFor: "so-warehouse", required: true, children: _jsxs(Select, { id: "so-warehouse", value: createForm.warehouseId, onChange: (event) => setCreateForm({ ...createForm, warehouseId: event.target.value }), children: [_jsx("option", { value: "", children: "Select a warehouse" }), warehouseOptions.map((warehouse) => _jsx("option", { value: warehouse.id, children: warehouse.name }, warehouse.id))] }) }), _jsx(Field, { label: "Expected date", htmlFor: "so-expected", children: _jsx(Input, { id: "so-expected", type: "date", value: createForm.expectedDate, onChange: (event) => setCreateForm({ ...createForm, expectedDate: event.target.value }) }) })] }), _jsxs("div", { children: [_jsxs("div", { className: "mb-2 flex items-center justify-between", children: [_jsx("p", { className: "text-sm font-medium text-slate-700", children: "Order lines" }), _jsx(Button, { variant: "secondary", size: "sm", icon: _jsx(Plus, { className: "h-3.5 w-3.5" }), onClick: () => setLines((current) => [...current, { ...EMPTY_LINE }]), children: "Add line" })] }), _jsx("div", { className: "space-y-2", children: lines.map((line, index) => _jsxs("div", { className: "grid gap-2 rounded-lg border border-slate-200 p-3 sm:grid-cols-12 sm:items-end", children: [_jsx(Field, { label: "Product", className: "sm:col-span-5", htmlFor: `so-line-product-${index}`, children: _jsxs(Select, { id: `so-line-product-${index}`, value: line.productId, onChange: (event) => {
                                                        const product = productOptions.find((p) => p.id === event.target.value);
                                                        updateLine(index, {
                                                            productId: event.target.value,
                                                            // Default to the product's selling price.
                                                            unitPrice: product ? String(product.sellingPrice) : line.unitPrice
                                                        });
                                                    }, children: [_jsx("option", { value: "", children: "Select a product" }), productOptions.map((product) => _jsxs("option", { value: product.id, children: [product.name, " (", product.sku, ")"] }, product.id))] }) }), _jsx(Field, { label: "Qty", className: "sm:col-span-2", htmlFor: `so-line-qty-${index}`, children: _jsx(Input, { id: `so-line-qty-${index}`, type: "number", step: "0.01", min: "0", value: line.quantity, onChange: (event) => updateLine(index, { quantity: event.target.value }) }) }), _jsx(Field, { label: "Unit price", className: "sm:col-span-2", htmlFor: `so-line-price-${index}`, children: _jsx(Input, { id: `so-line-price-${index}`, type: "number", step: "0.01", min: "0", prefix: "$", value: line.unitPrice, onChange: (event) => updateLine(index, { unitPrice: event.target.value }) }) }), _jsxs("div", { className: "flex items-center justify-between gap-2 sm:col-span-3", children: [_jsx("span", { className: "tabular text-sm font-semibold text-slate-900", children: formatCurrency(lineTotal(line)) }), _jsx(Button, { variant: "ghost", size: "sm", className: "text-red-600 hover:bg-red-50", disabled: lines.length === 1, onClick: () => setLines((current) => current.filter((_, i) => i !== index)), "aria-label": `Remove line ${index + 1}`, children: _jsx(Trash2, { className: "h-3.5 w-3.5" }) })] })] }, index)) }), _jsx("div", { className: "mt-3 flex justify-end border-t border-slate-200 pt-3", children: _jsxs("p", { className: "text-sm text-slate-600", children: ["Order total:", " ", _jsx("span", { className: "tabular text-base font-semibold text-slate-900", children: formatCurrency(orderTotal) })] }) })] }), createError ? _jsx(Alert, { tone: "danger", children: createError }) : null] }) }), _jsx(Modal, { open: detailId !== null, onClose: () => setDetailId(null), title: detail.data?.orderNumber ?? "Sales order", description: detail.data ? `${detail.data.customer?.name ?? "Customer"} \xB7 ${detail.data.warehouse?.name ?? ""}` : void 0, size: "lg", footer: _jsx(Button, { variant: "secondary", onClick: () => setDetailId(null), children: "Close" }), children: !detail.data ? _jsx("p", { className: "py-8 text-center text-sm text-slate-500", children: "Loading\u2026" }) : _jsxs("div", { className: "space-y-4", children: [_jsxs("div", { className: "flex flex-wrap items-center gap-3", children: [_jsx(StatusBadge, { status: detail.data.status }), _jsx("span", { className: "tabular text-sm font-semibold text-slate-900", children: formatCurrency(detail.data.totalAmount) }), detail.data.expectedDate ? _jsxs("span", { className: "text-xs text-slate-500", children: ["Expected ", formatDate(detail.data.expectedDate)] }) : null, detail.data.shippedAt ? _jsxs("span", { className: "text-xs text-slate-500", children: ["Shipped ", formatDate(detail.data.shippedAt)] }) : null] }), _jsx("div", { className: "overflow-x-auto", children: _jsxs("table", { className: "w-full", children: [_jsx("thead", { className: "border-b border-slate-200 bg-slate-50", children: _jsxs("tr", { children: [_jsx("th", { className: "th", children: "Product" }), _jsx("th", { className: "th text-right", children: "Ordered" }), _jsx("th", { className: "th text-right", children: "Issued" }), _jsx("th", { className: "th text-right", children: "Unit price" }), _jsx("th", { className: "th text-right", children: "Total" })] }) }), _jsx("tbody", { className: "divide-y divide-slate-100", children: detailItems.map((item) => _jsxs("tr", { children: [_jsxs("td", { className: "td", children: [_jsx("p", { className: "font-medium text-slate-900", children: item.product?.name }), _jsx("p", { className: "font-mono text-xs text-slate-500", children: item.product?.sku })] }), _jsx("td", { className: "td tabular text-right", children: formatNumber(item.quantity) }), _jsx("td", { className: "td tabular text-right", children: formatNumber(item.fulfilledQuantity) }), _jsx("td", { className: "td tabular text-right", children: formatCurrency(item.unitPrice) }), _jsx("td", { className: "td tabular text-right font-medium", children: formatCurrency(item.totalPrice) })] }, item.id)) })] }) })] }) }), _jsx(Modal, { open: issueTarget !== null, onClose: () => {
                    setIssueTarget(null);
                    setIssueLines({});
                }, title: `Issue ${issueTarget?.orderNumber ?? "stock"}`, description: "Enter what is physically leaving the warehouse.", size: "lg", footer: _jsxs(_Fragment, { children: [_jsx(Button, { variant: "secondary", onClick: () => {
                                setIssueTarget(null);
                                setIssueLines({});
                            }, disabled: issueStock.isPending, children: "Cancel" }), _jsx(Button, { onClick: () => {
                                if (issueTarget)
                                    issueStock.mutate();
                            }, loading: issueStock.isPending, disabled: !Object.values(issueLines).some((quantity) => Number(quantity) > 0), children: "Confirm issue" })] }), children: _jsxs("div", { className: "space-y-3", children: [(issueTarget?.items ?? []).map((item) => {
                            const outstanding = item.quantity - item.fulfilledQuantity;
                            if (outstanding <= 0)
                                return null;
                            return _jsxs("div", { className: "rounded-lg border border-slate-200 p-3", children: [_jsxs("div", { className: "mb-2 flex items-center justify-between gap-2", children: [_jsx("p", { className: "text-sm font-medium text-slate-900", children: item.product?.name }), _jsxs("p", { className: "tabular shrink-0 text-xs text-slate-500", children: [formatNumber(item.fulfilledQuantity), " of ", formatNumber(item.quantity), " issued"] })] }), _jsx(Field, { label: "Issuing now", htmlFor: `issue-qty-${item.id}`, children: _jsx(Input, { id: `issue-qty-${item.id}`, type: "number", step: "0.01", min: "0", max: outstanding, value: issueLines[item.id] ?? "", onChange: (event) => setIssueLines((current) => ({ ...current, [item.id]: event.target.value })), placeholder: "0" }) })] }, item.id);
                        }), issueStock.error ? _jsx(Alert, { tone: "danger", children: issueStock.error.message }) : null] }) })] });
}
export { SalesOrdersPage };
