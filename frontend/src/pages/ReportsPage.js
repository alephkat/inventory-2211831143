import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { api, normalizeList, tokenStore } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/lib/ToastProvider";
import { formatCurrency, formatDate, formatNumber, humanize } from "@/lib/format";
import { Alert, Button, Card, CardHeader, Field, Input, LoadingBlock, PageHeader, Select } from "@/components/ui";
import { StatCard } from "@/components/feedback";
import { DataTable, Pagination } from "@/components/DataTable";
import { TopProductsChart } from "@/components/charts";
import { StatusBadge } from "@/components/StatusBadge";
const TABS = [
    { key: "valuation", label: "Valuation" },
    { key: "movements", label: "Movements" },
    { key: "expiry", label: "Expiry" },
    { key: "fast-moving", label: "Fast moving" }
];
const MOVEMENT_TYPES = ["RECEIVED", "ISSUED", "RETURNED", "TRANSFERRED", "ADJUSTED", "DAMAGED", "LOST", "EXPIRED"];
function ReportsPage() {
    const { can } = useAuth();
    const toast = useToast();
    const [tab, setTab] = useState("valuation");
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(20);
    const [warehouseId, setWarehouseId] = useState("");
    const [categoryId, setCategoryId] = useState("");
    const [movementType, setMovementType] = useState("");
    const [startDate, setStartDate] = useState("");
    const [endDate, setEndDate] = useState("");
    const [expiryDays, setExpiryDays] = useState("90");
    const warehouses = useQuery({
        queryKey: ["warehouses", "all"],
        queryFn: () => api.get("/api/v1/warehouses", { limit: 100 })
    });
    const categories = useQuery({
        queryKey: ["categories", "all"],
        queryFn: () => api.get("/api/v1/categories", { limit: 100 })
    });
    const warehouseOptions = normalizeList(warehouses.data, 100).items;
    const categoryOptions = normalizeList(categories.data, 100).items;
    const valuation = useQuery({
        queryKey: ["reports", "valuation", warehouseId, categoryId, page, limit],
        queryFn: () => api.get("/api/v1/reports/valuation", {
            page,
            limit,
            warehouseId: warehouseId || void 0,
            categoryId: categoryId || void 0
        }),
        enabled: tab === "valuation"
    });
    const movements = useQuery({
        queryKey: ["reports", "movements", movementType, startDate, endDate, page, limit],
        queryFn: () => api.get("/api/v1/reports/movements", {
            page,
            limit,
            type: movementType || void 0,
            startDate: startDate || void 0,
            endDate: endDate || void 0
        }),
        enabled: tab === "movements"
    });
    const expiry = useQuery({
        queryKey: ["reports", "expiry", expiryDays, warehouseId, categoryId, page, limit],
        queryFn: () => api.get("/api/v1/reports/expiry", {
            page,
            limit,
            days: expiryDays,
            warehouseId: warehouseId || void 0,
            categoryId: categoryId || void 0
        }),
        enabled: tab === "expiry"
    });
    const fastMoving = useQuery({
        queryKey: ["reports", "fast-moving", expiryDays, warehouseId],
        queryFn: () => api.get("/api/v1/reports/fast-moving", {
            days: expiryDays,
            warehouseId: warehouseId || void 0
        }),
        enabled: tab === "fast-moving"
    });
    const movementList = normalizeList(movements.data, limit);
    const expiryList = normalizeList(expiry.data, limit);
    const exportValuation = async () => {
        try {
            const base = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");
            const query = new URLSearchParams({
                warehouseId,
                categoryId
            });
            query.forEach((value, key) => {
                if (!value)
                    query.delete(key);
            });
            const response = await fetch(`${base}/api/v1/reports/valuation/export?${query.toString()}`, { headers: { Authorization: `Bearer ${tokenStore.access ?? ""}` } });
            if (!response.ok)
                throw new Error("Export failed");
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement("a");
            anchor.href = url;
            anchor.download = "inventory-valuation.csv";
            anchor.click();
            URL.revokeObjectURL(url);
            toast.success("Valuation exported");
        }
        catch (error) {
            toast.error(error, "Could not export the report");
        }
    };
    const valuationColumns = [
        {
            key: "product",
            header: "Product",
            render: (row) => _jsxs("div", { className: "min-w-0", children: [_jsx("p", { className: "truncate font-medium text-slate-900", children: row.productName }), _jsx("p", { className: "truncate font-mono text-xs text-slate-500", children: row.sku })] })
        },
        {
            key: "category",
            header: "Category",
            secondary: true,
            render: (row) => row.category ?? "\u2014"
        },
        {
            key: "warehouse",
            header: "Warehouse",
            secondary: true,
            render: (row) => row.warehouse ?? "\u2014"
        },
        {
            key: "quantity",
            header: "Quantity",
            render: (row) => _jsx("span", { className: "tabular font-medium text-slate-900", children: formatNumber(row.quantity) })
        },
        {
            key: "cost",
            header: "Unit cost",
            secondary: true,
            render: (row) => _jsx("span", { className: "tabular text-slate-600", children: formatCurrency(row.costPrice) })
        },
        {
            key: "value",
            header: "Stock value",
            render: (row) => _jsx("span", { className: "tabular font-semibold text-slate-900", children: formatCurrency(row.stockValue) })
        }
    ];
    const movementColumns = [
        {
            key: "date",
            header: "When",
            render: (row) => _jsx("span", { className: "whitespace-nowrap text-xs", children: formatDate(row.createdAt) })
        },
        {
            key: "product",
            header: "Product",
            render: (row) => _jsxs("div", { className: "min-w-0", children: [_jsx("p", { className: "truncate font-medium text-slate-900", children: row.product?.name ?? "\u2014" }), _jsx("p", { className: "truncate font-mono text-xs text-slate-500", children: row.product?.sku ?? "\u2014" })] })
        },
        {
            key: "type",
            header: "Type",
            secondary: true,
            render: (row) => _jsx(StatusBadge, { status: row.type })
        },
        {
            key: "quantity",
            header: "Quantity",
            render: (row) => _jsx("span", { className: "tabular font-semibold text-slate-900", children: formatNumber(row.quantity) })
        },
        {
            key: "warehouse",
            header: "Warehouse",
            secondary: true,
            render: (row) => row.warehouse?.name ?? "\u2014"
        },
        {
            key: "performedBy",
            header: "By",
            secondary: true,
            render: (row) => row.performedBy?.fullName ?? "\u2014"
        },
        {
            key: "status",
            header: "Status",
            render: (row) => _jsx(StatusBadge, { status: row.status })
        }
    ];
    const expiryColumns = [
        {
            key: "product",
            header: "Product",
            render: (row) => _jsxs("div", { className: "min-w-0", children: [_jsx("p", { className: "truncate font-medium text-slate-900", children: row.name }), _jsxs("p", { className: "truncate font-mono text-xs text-slate-500", children: [row.sku, row.batchNumber ? ` \xB7 ${row.batchNumber}` : ""] })] })
        },
        {
            key: "warehouse",
            header: "Warehouse",
            secondary: true,
            render: (row) => row.warehouse ?? "\u2014"
        },
        {
            key: "quantity",
            header: "On hand",
            render: (row) => _jsx("span", { className: "tabular font-medium text-slate-900", children: formatNumber(row.currentStock) })
        },
        {
            key: "expiry",
            header: "Expires",
            render: (row) => formatDate(row.expiryDate)
        },
        {
            key: "days",
            header: "Days left",
            render: (row) => {
                const days = row.daysUntilExpiry ?? 0;
                return _jsx("span", { className: days <= 7 ? "tabular inline-flex rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700" : days <= 30 ? "tabular inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700" : "tabular inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600", children: days });
            }
        }
    ];
    const fastMovingItems = fastMoving.data ?? [];
    const fastMovingColumns = [
        {
            key: "product",
            header: "Product",
            render: (row) => _jsxs("div", { className: "min-w-0", children: [_jsx("p", { className: "truncate font-medium text-slate-900", children: row.productName ?? "\u2014" }), _jsx("p", { className: "truncate font-mono text-xs text-slate-500", children: row.sku ?? "\u2014" })] })
        },
        {
            key: "sold",
            header: "Quantity sold",
            render: (row) => _jsx("span", { className: "tabular font-semibold text-slate-900", children: formatNumber(row.quantitySold) })
        },
        {
            key: "revenue",
            header: "Revenue",
            render: (row) => _jsx("span", { className: "tabular font-medium text-slate-900", children: formatCurrency(row.revenue) })
        },
        {
            key: "stock",
            header: "Remaining",
            secondary: true,
            render: (row) => _jsx("span", { className: "tabular text-slate-600", children: formatNumber(row.currentStock) })
        }
    ];
    return _jsxs("div", { className: "space-y-5", children: [_jsx(PageHeader, { title: "Reports", description: "Valuation, movements, expiry and velocity", actions: can("export_reports") && tab === "valuation" ? _jsx(Button, { variant: "secondary", icon: _jsx(Download, { className: "h-4 w-4" }), onClick: () => void exportValuation(), children: "Export CSV" }) : null }), _jsx("div", { className: "flex gap-1 overflow-x-auto rounded-lg border border-slate-200 bg-white p-1", children: TABS.map((item) => _jsx("button", { onClick: () => {
                        setTab(item.key);
                        setPage(1);
                    }, className: tab === item.key ? "flex-1 whitespace-nowrap rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white" : "flex-1 whitespace-nowrap rounded-md px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50", children: item.label }, item.key)) }), _jsx(Card, { children: _jsxs("div", { className: "grid gap-4 sm:grid-cols-2 lg:grid-cols-4", children: [tab === "valuation" || tab === "expiry" ? _jsx(Field, { label: "Warehouse", children: _jsxs(Select, { value: warehouseId, onChange: (event) => {
                                    setWarehouseId(event.target.value);
                                    setPage(1);
                                }, children: [_jsx("option", { value: "", children: "All warehouses" }), warehouseOptions.map((warehouse) => _jsx("option", { value: warehouse.id, children: warehouse.name }, warehouse.id))] }) }) : null, tab === "valuation" || tab === "expiry" ? _jsx(Field, { label: "Category", children: _jsxs(Select, { value: categoryId, onChange: (event) => {
                                    setCategoryId(event.target.value);
                                    setPage(1);
                                }, children: [_jsx("option", { value: "", children: "All categories" }), categoryOptions.map((category) => _jsx("option", { value: category.id, children: category.name }, category.id))] }) }) : null, tab === "movements" ? _jsxs(_Fragment, { children: [_jsx(Field, { label: "Movement type", children: _jsxs(Select, { value: movementType, onChange: (event) => {
                                            setMovementType(event.target.value);
                                            setPage(1);
                                        }, children: [_jsx("option", { value: "", children: "All types" }), MOVEMENT_TYPES.map((type) => _jsx("option", { value: type, children: humanize(type) }, type))] }) }), _jsx(Field, { label: "From", children: _jsx(Input, { type: "date", value: startDate, onChange: (event) => {
                                            setStartDate(event.target.value);
                                            setPage(1);
                                        } }) }), _jsx(Field, { label: "To", children: _jsx(Input, { type: "date", value: endDate, onChange: (event) => {
                                            setEndDate(event.target.value);
                                            setPage(1);
                                        } }) })] }) : null, tab === "expiry" || tab === "fast-moving" ? _jsx(Field, { label: "Window (days)", htmlFor: "report-days", children: _jsx(Input, { id: "report-days", type: "number", min: "1", value: expiryDays, onChange: (event) => {
                                    setExpiryDays(event.target.value);
                                    setPage(1);
                                } }) }) : null, tab === "fast-moving" ? _jsx(Field, { label: "Warehouse", children: _jsxs(Select, { value: warehouseId, onChange: (event) => setWarehouseId(event.target.value), children: [_jsx("option", { value: "", children: "All warehouses" }), warehouseOptions.map((warehouse) => _jsx("option", { value: warehouse.id, children: warehouse.name }, warehouse.id))] }) }) : null] }) }), tab === "valuation" ? _jsxs(_Fragment, { children: [_jsxs("div", { className: "grid gap-4 sm:grid-cols-2", children: [_jsx(StatCard, { label: "Total stock value", value: formatCurrency(valuation.data?.summary.totalValue ?? 0), hint: "Across the filtered selection", tone: "brand" }), _jsx(StatCard, { label: "Total units", value: formatNumber(valuation.data?.summary.totalQuantity ?? 0), hint: `${valuation.data?.total ?? 0} stock records` })] }), _jsxs(Card, { padded: false, children: [_jsx(CardHeader, { title: "Inventory valuation" }), _jsx(DataTable, { columns: valuationColumns, rows: valuation.data?.items ?? [], rowKey: (row) => `${row.productId}-${row.warehouse ?? ""}`, isLoading: valuation.isLoading, error: valuation.error, emptyTitle: "No valuation data", emptyDescription: "Stock value appears once products are stocked." }), (valuation.data?.total ?? 0) > 0 ? _jsx(Pagination, { page: page, limit: limit, total: valuation.data?.total ?? 0, onPageChange: setPage, onLimitChange: (value) => {
                                    setLimit(value);
                                    setPage(1);
                                } }) : null] })] }) : null, tab === "movements" ? _jsxs(Card, { padded: false, children: [_jsx(CardHeader, { title: "Stock movements", description: "All recorded ledger entries in the selected window" }), _jsx(DataTable, { columns: movementColumns, rows: movementList.items, rowKey: (row) => row.id, isLoading: movements.isLoading, error: movements.error, emptyTitle: "No movements in this range", emptyDescription: "Widen the date range to see more activity." }), movementList.total > 0 ? _jsx(Pagination, { page: page, limit: limit, total: movementList.total, onPageChange: setPage, onLimitChange: (value) => {
                            setLimit(value);
                            setPage(1);
                        } }) : null] }) : null, tab === "expiry" ? _jsxs(Card, { padded: false, children: [_jsx(CardHeader, { title: "Expiry watchlist", description: `Products expiring within ${expiryDays || 90} days` }), _jsx(DataTable, { columns: expiryColumns, rows: expiryList.items, rowKey: (row) => `${row.productId}-${row.expiryDate ?? ""}`, isLoading: expiry.isLoading, error: expiry.error, emptyTitle: "Nothing expiring soon", emptyDescription: "No products fall inside this window." }), expiryList.total > 0 ? _jsx(Pagination, { page: page, limit: limit, total: expiryList.total, onPageChange: setPage, onLimitChange: (value) => {
                            setLimit(value);
                            setPage(1);
                        } }) : null] }) : null, tab === "fast-moving" ? _jsxs("div", { className: "grid gap-4 xl:grid-cols-2", children: [_jsxs(Card, { padded: false, children: [_jsx(CardHeader, { title: "Fastest movers", description: `Top 10 by quantity issued over ${expiryDays || 90} days` }), fastMoving.isLoading ? _jsx(LoadingBlock, {}) : _jsx(TopProductsChart, { data: fastMovingItems.map((item) => ({
                                    label: item.productName ?? item.sku ?? "Unknown",
                                    value: item.quantitySold
                                })) })] }), _jsxs(Card, { padded: false, children: [_jsx(CardHeader, { title: "Movement detail" }), _jsx(DataTable, { columns: fastMovingColumns, rows: fastMovingItems, rowKey: (row) => row.productId, isLoading: fastMoving.isLoading, error: fastMoving.error, emptyTitle: "No completed issues", emptyDescription: "Once stock is issued, velocity appears here." })] })] }) : null, !can("export_reports") ? _jsx(Alert, { tone: "info", children: "You can view reports but not export them. Ask an administrator for the \u201CExport Reports\u201D permission to download CSV files." }) : null] });
}
export { ReportsPage };
