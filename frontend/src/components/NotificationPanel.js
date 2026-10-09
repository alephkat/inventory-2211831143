import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck } from "lucide-react";
import { api, normalizeList } from "@/lib/api";
import { formatRelative, humanize } from "@/lib/format";
import { Badge } from "./ui.jsx";
import { Button } from "./ui.jsx";
const PRIORITY_TONE = {
    LOW: "neutral",
    MEDIUM: "info",
    HIGH: "warning",
    URGENT: "danger"
};
function NotificationPanel({ open, onClose }) {
    const queryClient = useQueryClient();
    const { data, isLoading } = useQuery({
        queryKey: ["notifications", "list"],
        queryFn: () => api.get("/api/v1/notifications", { page: 1, limit: 15 }),
        enabled: open
    });
    const list = normalizeList(data, 15);
    const markRead = useMutation({
        mutationFn: (id) => api.post(`/api/v1/notifications/${id}/read`),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ["notifications"] });
        }
    });
    const markAllRead = useMutation({
        mutationFn: () => api.post("/api/v1/notifications/read-all"),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ["notifications"] });
        }
    });
    if (!open)
        return null;
    return _jsxs(_Fragment, { children: [_jsx("div", { className: "fixed inset-0 z-30", onClick: onClose, "aria-hidden": true }), _jsxs("div", { className: "absolute right-0 z-40 mt-2 w-[22rem] animate-fade-in overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg", children: [_jsxs("div", { className: "flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-3", children: [_jsx("p", { className: "text-sm font-semibold text-slate-900", children: "Notifications" }), _jsxs(Button, { variant: "ghost", size: "sm", onClick: () => markAllRead.mutate(), loading: markAllRead.isPending, disabled: list.items.length === 0, children: [_jsx(CheckCheck, { className: "h-3.5 w-3.5" }), "Mark all read"] })] }), _jsx("div", { className: "max-h-96 overflow-y-auto", children: isLoading ? _jsx("p", { className: "px-4 py-10 text-center text-sm text-slate-500", children: "Loading\u2026" }) : list.items.length === 0 ? _jsxs("div", { className: "flex flex-col items-center gap-2 px-4 py-10 text-center", children: [_jsx(Bell, { className: "h-8 w-8 text-slate-300" }), _jsx("p", { className: "text-sm text-slate-500", children: "You are all caught up." })] }) : _jsx("ul", { className: "divide-y divide-slate-100", children: list.items.map((notification) => _jsxs("li", { className: notification.isRead ? "px-4 py-3" : "bg-brand-50/40 px-4 py-3 hover:bg-brand-50/70", children: [_jsxs("div", { className: "flex items-start justify-between gap-2", children: [_jsx("p", { className: "min-w-0 flex-1 text-sm font-medium text-slate-900", children: notification.title }), !notification.isRead ? _jsx("button", { className: "shrink-0 rounded p-1 text-slate-400 hover:bg-white hover:text-slate-600", onClick: () => markRead.mutate(notification.id), "aria-label": `Mark "${notification.title}" as read`, children: _jsx(CheckCheck, { className: "h-3.5 w-3.5" }) }) : null] }), _jsx("p", { className: "mt-0.5 text-xs leading-relaxed text-slate-600", children: notification.body }), _jsxs("div", { className: "mt-1.5 flex items-center gap-2", children: [_jsx(Badge, { tone: PRIORITY_TONE[notification.priority] ?? "neutral", children: humanize(notification.priority) }), _jsx("span", { className: "text-[11px] text-slate-400", children: formatRelative(notification.createdAt) })] })] }, notification.id)) }) })] })] });
}
export { NotificationPanel };
