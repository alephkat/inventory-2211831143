import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { api, normalizeList } from "@/lib/api";
import { formatDateTime, humanize } from "@/lib/format";
import { Badge, Button, Card, Field, Input, PageHeader, Select } from "@/components/ui";
import { DataTable, Pagination } from "@/components/DataTable";
const ACTIONS = [
    "CREATE",
    "UPDATE",
    "DELETE",
    "LOGIN",
    "LOGOUT",
    "APPROVE",
    "REJECT",
    "RECEIVE",
    "ISSUE",
    "TRANSFER",
    "ADJUST",
    "COUNT",
    "DISPATCH",
    "CONFIRM",
    "OVERRIDE"
];
const RESOURCE_TYPES = [
    "product",
    "inventory_transaction",
    "purchase_order",
    "sales_order",
    "stock_receipt",
    "stock_issue",
    "stock_transfer",
    "stock_adjustment",
    "stock_count",
    "supplier",
    "customer",
    "warehouse",
    "category",
    "user",
    "role",
    "auth"
];
const ACTION_TONE = {
    CREATE: "success",
    UPDATE: "info",
    DELETE: "danger",
    LOGIN: "neutral",
    LOGOUT: "neutral",
    APPROVE: "success",
    REJECT: "danger",
    RECEIVE: "success",
    ISSUE: "warning",
    TRANSFER: "info",
    ADJUST: "warning",
    COUNT: "info",
    DISPATCH: "info",
    CONFIRM: "success",
    OVERRIDE: "warning"
};
function DiffCell({ value }) {
    if (!value || typeof value !== "object")
        return _jsx("span", { className: "text-slate-400", children: "\u2014" });
    const entries = Object.entries(value);
    if (entries.length === 0)
        return _jsx("span", { className: "text-slate-400", children: "\u2014" });
    return _jsxs("div", { className: "space-y-0.5", children: [entries.slice(0, 3).map(([key, entryValue]) => _jsxs("p", { className: "truncate text-[11px] text-slate-500", children: [_jsxs("span", { className: "text-slate-400", children: [key, ":"] }), " ", _jsx("span", { className: "font-mono text-slate-700", children: entryValue === null || entryValue === void 0 ? "\u2014" : typeof entryValue === "object" ? JSON.stringify(entryValue) : String(entryValue) })] }, key)), entries.length > 3 ? _jsxs("p", { className: "text-[11px] text-slate-400", children: ["+", entries.length - 3, " more"] }) : null] });
}
function AuditLogsPage() {
    const searchTimer = useRef();
    const [search, setSearch] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");
    const [action, setAction] = useState("");
    const [resourceType, setResourceType] = useState("");
    const [userId, setUserId] = useState("");
    const [startDate, setStartDate] = useState("");
    const [endDate, setEndDate] = useState("");
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(50);
    const logs = useQuery({
        queryKey: ["audit-logs", "list", debouncedSearch, action, resourceType, userId, startDate, endDate, page, limit],
        queryFn: () => api.get("/api/v1/audit-logs", {
            page,
            limit,
            // The API filters by userId rather than a free-text field, so the
            // search box targets username/name and is matched client-side after
            // the server has applied the remaining filters.
            userId: userId || void 0,
            action: action || void 0,
            resourceType: resourceType || void 0,
            startDate: startDate || void 0,
            endDate: endDate || void 0
        })
    });
    const users = useQuery({
        queryKey: ["users", "all"],
        queryFn: () => api.get("/api/v1/users", { limit: 100 })
    });
    const allLogs = normalizeList(logs.data, limit);
    const rows = debouncedSearch ? allLogs.items.filter((log) => {
        const haystack = `${log.user?.fullName ?? ""} ${log.user?.username ?? ""} ${log.resourceType} ${log.resourceId}`.toLowerCase();
        return haystack.includes(debouncedSearch.toLowerCase());
    }) : allLogs.items;
    const userOptions = normalizeList(users.data, 100).items;
    const scheduleSearch = (value) => {
        setSearch(value);
        window.clearTimeout(searchTimer.current);
        searchTimer.current = window.setTimeout(() => {
            setDebouncedSearch(value);
            setPage(1);
        }, 300);
    };
    const resetFilters = () => {
        setSearch("");
        setDebouncedSearch("");
        setAction("");
        setResourceType("");
        setUserId("");
        setStartDate("");
        setEndDate("");
        setPage(1);
    };
    const hasFilters = Boolean(debouncedSearch || action || resourceType || userId || startDate || endDate);
    const columns = [
        {
            key: "when",
            header: "When",
            render: (log) => _jsx("span", { className: "whitespace-nowrap text-xs text-slate-500", children: formatDateTime(log.createdAt) })
        },
        {
            key: "user",
            header: "User",
            render: (log) => _jsxs("div", { className: "min-w-0", children: [_jsx("p", { className: "truncate font-medium text-slate-900", children: log.user?.fullName ?? log.userName ?? "System" }), log.user?.role?.name ? _jsx("p", { className: "truncate text-xs text-slate-500", children: humanize(log.user.role.name) }) : null] })
        },
        {
            key: "action",
            header: "Action",
            render: (log) => _jsx(Badge, { tone: ACTION_TONE[log.action] ?? "neutral", children: humanize(log.action) })
        },
        {
            key: "resource",
            header: "Resource",
            secondary: true,
            render: (log) => _jsxs("div", { className: "min-w-0", children: [_jsx("p", { className: "truncate text-slate-700", children: humanize(log.resourceType) }), _jsx("p", { className: "truncate font-mono text-[11px] text-slate-400", children: log.resourceId })] })
        },
        {
            key: "before",
            header: "Before",
            secondary: true,
            render: (log) => _jsx(DiffCell, { value: log.oldValues })
        },
        {
            key: "after",
            header: "After",
            secondary: true,
            render: (log) => _jsx(DiffCell, { value: log.newValues })
        }
    ];
    return _jsxs("div", { className: "space-y-5", children: [_jsx(PageHeader, { title: "Audit log", description: "An immutable record of every change made in the system", actions: hasFilters ? _jsx(Button, { variant: "secondary", onClick: resetFilters, children: "Clear filters" }) : null }), _jsx(Card, { children: _jsxs("div", { className: "grid gap-4 sm:grid-cols-2 lg:grid-cols-3", children: [_jsx(Field, { label: "Search user or resource", className: "lg:col-span-1", children: _jsxs("div", { className: "relative", children: [_jsx(Search, { className: "pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" }), _jsx(Input, { className: "pl-9", placeholder: "Name or resource ID\u2026", value: search, onChange: (event) => {
                                            scheduleSearch(event.target.value);
                                            setPage(1);
                                        } })] }) }), _jsx(Field, { label: "Action", children: _jsxs(Select, { value: action, onChange: (event) => {
                                    setAction(event.target.value);
                                    setPage(1);
                                }, children: [_jsx("option", { value: "", children: "All actions" }), ACTIONS.map((item) => _jsx("option", { value: item, children: humanize(item) }, item))] }) }), _jsx(Field, { label: "Resource", children: _jsxs(Select, { value: resourceType, onChange: (event) => {
                                    setResourceType(event.target.value);
                                    setPage(1);
                                }, children: [_jsx("option", { value: "", children: "All resources" }), RESOURCE_TYPES.map((item) => _jsx("option", { value: item, children: humanize(item) }, item))] }) }), _jsx(Field, { label: "User", children: _jsxs(Select, { value: userId, onChange: (event) => {
                                    setUserId(event.target.value);
                                    setPage(1);
                                }, children: [_jsx("option", { value: "", children: "All users" }), userOptions.map((user) => _jsxs("option", { value: user.id, children: [user.fullName, " (", user.username, ")"] }, user.id))] }) }), _jsx(Field, { label: "From", children: _jsx(Input, { type: "date", value: startDate, onChange: (event) => {
                                    setStartDate(event.target.value);
                                    setPage(1);
                                } }) }), _jsx(Field, { label: "To", children: _jsx(Input, { type: "date", value: endDate, onChange: (event) => {
                                    setEndDate(event.target.value);
                                    setPage(1);
                                } }) })] }) }), _jsxs(Card, { padded: false, children: [_jsx(DataTable, { columns: columns, rows: rows, rowKey: (log) => log.id, isLoading: logs.isLoading, error: logs.error, emptyTitle: "No audit entries", emptyDescription: "Activity appears here as soon as changes are made." }), allLogs.total > 0 ? _jsx(Pagination, { page: page, limit: limit, total: allLogs.total, onPageChange: setPage, onLimitChange: (value) => {
                            setLimit(value);
                            setPage(1);
                        } }) : null] }), _jsx("p", { className: "text-xs text-slate-400", children: "Audit entries are written by the server and cannot be edited or removed from the application." })] });
}
export { AuditLogsPage };
