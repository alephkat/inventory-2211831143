import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { ChevronLeft, ChevronRight, Inbox } from "lucide-react";
import { cn } from "@/lib/format";
import { Button, EmptyState, LoadingBlock } from "./ui.jsx";
function DataTable({ columns, rows, rowKey, isLoading = false, error, emptyTitle = "Nothing to show", emptyDescription, emptyAction, onRowClick }) {
    if (isLoading)
        return _jsx(LoadingBlock, {});
    if (error) {
        return _jsx("div", { className: "p-5", children: _jsx(EmptyState, { title: "Could not load this data", description: error instanceof Error ? error.message : "An unexpected error occurred.", icon: _jsx(Inbox, { className: "h-10 w-10" }) }) });
    }
    if (rows.length === 0) {
        return _jsx(EmptyState, { title: emptyTitle, description: emptyDescription, action: emptyAction, icon: _jsx(Inbox, { className: "h-10 w-10" }) });
    }
    return _jsx("div", { className: "overflow-x-auto", children: _jsxs("table", { className: "w-full border-collapse", children: [_jsx("thead", { className: "border-b border-slate-200 bg-slate-50", children: _jsx("tr", { children: columns.map((column) => _jsx("th", { className: cn("th", column.secondary && "hidden lg:table-cell", column.headerClassName), scope: "col", children: column.header }, column.key)) }) }), _jsx("tbody", { className: "divide-y divide-slate-100", children: rows.map((row) => _jsx("tr", { onClick: onRowClick ? () => onRowClick(row) : void 0, className: cn("bg-white transition", onRowClick && "cursor-pointer hover:bg-slate-50"), children: columns.map((column) => _jsx("td", { "data-label": column.header, className: cn("td", column.secondary && "hidden lg:table-cell", column.className), children: column.render(row) }, column.key)) }, rowKey(row))) })] }) });
}
const LIMIT_OPTIONS = [10, 20, 50, 100];
function Pagination({ page, limit, total, onPageChange, onLimitChange }) {
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const first = total === 0 ? 0 : (page - 1) * limit + 1;
    const last = Math.min(page * limit, total);
    return _jsxs("div", { className: "flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3", children: [_jsxs("p", { className: "text-xs text-slate-500", children: ["Showing ", _jsx("span", { className: "font-medium text-slate-700", children: first }), "\u2013", _jsx("span", { className: "font-medium text-slate-700", children: last }), " of", " ", _jsx("span", { className: "font-medium text-slate-700", children: total })] }), _jsxs("div", { className: "flex items-center gap-3", children: [onLimitChange ? _jsxs("label", { className: "flex items-center gap-1.5 text-xs text-slate-500", children: ["Rows", _jsx("select", { value: limit, onChange: (event) => onLimitChange(Number(event.target.value)), className: "rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500", children: LIMIT_OPTIONS.map((option) => _jsx("option", { value: option, children: option }, option)) })] }) : null, _jsxs("div", { className: "flex items-center gap-1", children: [_jsx(Button, { variant: "secondary", size: "sm", disabled: page <= 1, onClick: () => onPageChange(page - 1), "aria-label": "Previous page", children: _jsx(ChevronLeft, { className: "h-4 w-4" }) }), _jsxs("span", { className: "px-2 text-xs text-slate-600", children: ["Page ", page, " of ", totalPages] }), _jsx(Button, { variant: "secondary", size: "sm", disabled: page >= totalPages, onClick: () => onPageChange(page + 1), "aria-label": "Next page", children: _jsx(ChevronRight, { className: "h-4 w-4" }) })] })] })] });
}
export { DataTable, Pagination };
