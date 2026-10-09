import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Boxes, Search } from "lucide-react";
import { api, normalizeList } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatCurrency, formatNumber, formatRelative } from "@/lib/format";
import { Badge, Button, Card, Field, Input, PageHeader, Select } from "@/components/ui";
import { DataTable, Pagination } from "@/components/DataTable";
function InventoryPage() {
    const { can } = useAuth();
    const [searchParams, setSearchParams] = useSearchParams();
    const searchTimer = useRef();
    const initialView = searchParams.get("view") === "low-stock" ? "low-stock" : "levels";
    const [view, setView] = useState(initialView);
    const [search, setSearch] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");
    const [warehouseId, setWarehouseId] = useState("");
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(20);
    const warehouses = useQuery({
        queryKey: ["warehouses", "all"],
        queryFn: () => api.get("/api/v1/warehouses", { limit: 100 })
    });
    const levels = useQuery({
        queryKey: ["inventory", "levels", debouncedSearch, warehouseId, page, limit],
        queryFn: () => api.get("/api/v1/inventory/levels", {
            page,
            limit,
            search: debouncedSearch || void 0,
            warehouseId: warehouseId || void 0
        }),
        enabled: view === "levels"
    });
    const lowStock = useQuery({
        queryKey: ["inventory", "low-stock"],
        queryFn: () => api.get("/api/v1/inventory/levels/low-stock"),
        enabled: view === "low-stock"
    });
    const levelList = normalizeList(levels.data, limit);
    const warehouseOptions = normalizeList(warehouses.data, 100).items;
    const lowStockItems = lowStock.data ?? [];
    const scheduleSearch = (value) => {
        setSearch(value);
        window.clearTimeout(searchTimer.current);
        searchTimer.current = window.setTimeout(() => {
            setDebouncedSearch(value);
            setPage(1);
        }, 300);
    };
    const switchView = (next) => {
        setView(next);
        setPage(1);
        const params = new URLSearchParams(searchParams);
        if (next === "low-stock")
            params.set("view", "low-stock");
        else
            params.delete("view");
        setSearchParams(params, { replace: true });
    };
    const totalValue = levelList.items.reduce((sum, row) => sum + (row.stockValue ?? 0), 0);
    const levelColumns = [
        {
            key: "product",
            header: "Product",
            render: (row) => _jsxs("div", { className: "min-w-0", children: [_jsx("p", { className: "truncate font-medium text-slate-900", children: row.product?.name ?? "\u2014" }), _jsx("p", { className: "truncate font-mono text-xs text-slate-500", children: row.product?.sku ?? "\u2014" })] })
        },
        {
            key: "warehouse",
            header: "Warehouse",
            secondary: true,
            render: (row) => row.warehouse?.name ?? "\u2014"
        },
        {
            key: "onHand",
            header: "On hand",
            render: (row) => _jsxs("div", { children: [_jsx("p", { className: "tabular font-medium text-slate-900", children: formatNumber(row.currentQuantity) }), _jsxs("p", { className: "text-[11px] text-slate-500", children: [formatNumber(row.availableQuantity), " available"] })] })
        },
        {
            key: "reserved",
            header: "Reserved",
            secondary: true,
            render: (row) => _jsxs("div", { children: [_jsx("p", { className: "tabular text-slate-700", children: formatNumber(row.reservedQuantity) }), row.damagedQuantity > 0 ? _jsxs("p", { className: "text-[11px] text-red-600", children: [formatNumber(row.damagedQuantity), " damaged"] }) : null] })
        },
        {
            key: "reorder",
            header: "Reorder level",
            secondary: true,
            render: (row) => _jsx("span", { className: "tabular text-slate-600", children: formatNumber(row.reorderQuantity ?? row.product?.reorderLevel ?? 0) })
        },
        {
            key: "value",
            header: "Stock value",
            render: (row) => _jsx("span", { className: "tabular font-medium text-slate-900", children: formatCurrency(row.stockValue) })
        },
        {
            key: "updated",
            header: "Last updated",
            secondary: true,
            render: (row) => _jsx("span", { className: "text-xs text-slate-500", children: formatRelative(row.lastUpdated) })
        }
    ];
    const lowStockColumns = [
        {
            key: "product",
            header: "Product",
            render: (item) => _jsxs("div", { className: "flex items-center gap-3", children: [_jsx("span", { className: "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600", children: _jsx(AlertTriangle, { className: "h-4 w-4" }) }), _jsxs("div", { className: "min-w-0", children: [_jsx("p", { className: "truncate font-medium text-slate-900", children: item.productName }), _jsx("p", { className: "truncate font-mono text-xs text-slate-500", children: item.sku })] })] })
        },
        {
            key: "warehouse",
            header: "Warehouse",
            secondary: true,
            render: (item) => item.warehouseName
        },
        {
            key: "current",
            header: "In stock",
            render: (item) => _jsx("span", { className: "tabular font-medium text-slate-900", children: formatNumber(item.currentStock) })
        },
        {
            key: "reorder",
            header: "Reorder at",
            secondary: true,
            render: (item) => _jsx("span", { className: "tabular text-slate-600", children: formatNumber(item.reorderLevel) })
        },
        {
            key: "deficit",
            header: "Deficit",
            render: (item) => _jsx(Badge, { tone: item.deficit > 0 ? "warning" : "neutral", children: item.deficit > 0 ? `short ${formatNumber(item.deficit)}` : "at level" })
        }
    ];
    return _jsxs("div", { className: "space-y-5", children: [_jsx(PageHeader, { title: "Stock levels", description: "Live quantities on hand across every warehouse", actions: can("receive_stock") || can("issue_stock") ? _jsxs("span", { className: "text-xs text-slate-500", children: ["Record movements from the", " ", _jsx("span", { className: "font-medium text-slate-700", children: "Transactions" }), " tab."] }) : null }), _jsx("div", { className: "flex gap-1 rounded-lg border border-slate-200 bg-white p-1", children: [
                    { key: "levels", label: "All stock", count: levelList.total },
                    { key: "low-stock", label: "Low stock", count: lowStockItems.length }
                ].map((tab) => _jsxs("button", { onClick: () => switchView(tab.key), className: view === tab.key ? "flex-1 rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white" : "flex-1 rounded-md px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50", children: [tab.label, tab.key === "low-stock" && lowStockItems.length > 0 ? _jsx("span", { className: view === tab.key ? "ml-2 rounded-full bg-white/20 px-1.5 py-0.5 text-xs" : "ml-2 rounded-full bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700", children: lowStockItems.length }) : null] }, tab.key)) }), _jsx(Card, { padded: false, children: view === "levels" ? _jsxs(_Fragment, { children: [_jsxs("div", { className: "grid gap-3 border-b border-slate-200 p-4 sm:grid-cols-3", children: [_jsx(Field, { label: "Search", className: "sm:col-span-2", children: _jsxs("div", { className: "relative", children: [_jsx(Search, { className: "pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" }), _jsx(Input, { className: "pl-9", placeholder: "Product, SKU or warehouse\u2026", value: search, onChange: (event) => {
                                                    scheduleSearch(event.target.value);
                                                    setPage(1);
                                                } })] }) }), _jsx(Field, { label: "Warehouse", children: _jsxs(Select, { value: warehouseId, onChange: (event) => {
                                            setWarehouseId(event.target.value);
                                            setPage(1);
                                        }, children: [_jsx("option", { value: "", children: "All warehouses" }), warehouseOptions.map((warehouse) => _jsx("option", { value: warehouse.id, children: warehouse.name }, warehouse.id))] }) })] }), levelList.items.length > 0 ? _jsxs("div", { className: "flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3", children: [_jsxs("p", { className: "text-xs text-slate-600", children: ["Page total:", " ", _jsx("span", { className: "tabular font-semibold text-slate-900", children: formatCurrency(totalValue) })] }), _jsx(Button, { variant: "ghost", size: "sm", onClick: () => switchView("low-stock"), children: "Show only low stock" })] }) : null, _jsx(DataTable, { columns: levelColumns, rows: levelList.items, rowKey: (row) => row.id, isLoading: levels.isLoading, error: levels.error, emptyTitle: "No stock records found", emptyDescription: debouncedSearch || warehouseId ? "Try clearing the filters." : "Stock appears here once products are received into a warehouse.", emptyAction: !debouncedSearch && !warehouseId ? _jsx(Button, { icon: _jsx(Boxes, { className: "h-4 w-4" }), onClick: () => switchView("low-stock"), children: "View low stock" }) : null }), levelList.total > 0 ? _jsx(Pagination, { page: page, limit: limit, total: levelList.total, onPageChange: setPage, onLimitChange: (value) => {
                                setLimit(value);
                                setPage(1);
                            } }) : null] }) : _jsxs(_Fragment, { children: [_jsx("div", { className: "border-b border-slate-200 bg-amber-50/50 px-4 py-3", children: _jsx("p", { className: "text-xs text-amber-800", children: "Items at or below their reorder level. Raise a purchase order or adjust stock to bring them back up." }) }), _jsx(DataTable, { columns: lowStockColumns, rows: lowStockItems, rowKey: (item) => `${item.productId}-${item.warehouseId}`, isLoading: lowStock.isLoading, error: lowStock.error, emptyTitle: "Nothing is low on stock", emptyDescription: "Every product is above its reorder level." })] }) })] });
}
export { InventoryPage };
