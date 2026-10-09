import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, Bell, Boxes, ChevronDown, ClipboardList, FileBarChart, LayoutDashboard, LogOut, Menu, Package, ScrollText, ShieldCheck, ShoppingCart, Truck, UserCog, Users, Warehouse, X } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { cn, humanize, initials } from "@/lib/format";
import { NotificationPanel } from "./NotificationPanel.jsx";
const NAV_GROUPS = [
    {
        label: "Overview",
        items: [
            { label: "Dashboard", to: "/", icon: _jsx(LayoutDashboard, { className: "h-4.5 w-4.5" }), end: true }
        ]
    },
    {
        label: "Catalog",
        items: [
            {
                label: "Products",
                to: "/products",
                icon: _jsx(Package, { className: "h-4.5 w-4.5" }),
                permissions: ["view_inventory"]
            },
            {
                label: "Categories",
                to: "/categories",
                icon: _jsx(Archive, { className: "h-4.5 w-4.5" }),
                permissions: ["view_inventory"]
            },
            {
                label: "Suppliers",
                to: "/suppliers",
                icon: _jsx(Truck, { className: "h-4.5 w-4.5" }),
                permissions: ["manage_suppliers"]
            },
            {
                label: "Customers",
                to: "/customers",
                icon: _jsx(Users, { className: "h-4.5 w-4.5" }),
                permissions: ["manage_customers"]
            }
        ]
    },
    {
        label: "Inventory",
        items: [
            {
                label: "Warehouses",
                to: "/warehouses",
                icon: _jsx(Warehouse, { className: "h-4.5 w-4.5" }),
                permissions: ["manage_warehouses"]
            },
            {
                label: "Stock levels",
                to: "/inventory",
                icon: _jsx(Boxes, { className: "h-4.5 w-4.5" }),
                permissions: ["view_inventory"]
            },
            {
                label: "Transactions",
                to: "/transactions",
                icon: _jsx(ScrollText, { className: "h-4.5 w-4.5" }),
                permissions: ["view_inventory"]
            }
        ]
    },
    {
        label: "Operations",
        items: [
            {
                label: "Purchase orders",
                to: "/purchase-orders",
                icon: _jsx(ShoppingCart, { className: "h-4.5 w-4.5" }),
                permissions: ["manage_purchase_orders"]
            },
            {
                label: "Sales orders",
                to: "/sales-orders",
                icon: _jsx(ClipboardList, { className: "h-4.5 w-4.5" }),
                permissions: ["manage_sales_orders"]
            }
        ]
    },
    {
        label: "Insights",
        items: [
            {
                label: "Reports",
                to: "/reports",
                icon: _jsx(FileBarChart, { className: "h-4.5 w-4.5" }),
                permissions: ["view_reports"]
            },
            {
                label: "Audit log",
                to: "/audit-logs",
                icon: _jsx(ShieldCheck, { className: "h-4.5 w-4.5" }),
                permissions: ["view_audit_logs"]
            }
        ]
    },
    {
        label: "Administration",
        items: [
            { label: "Users", to: "/users", icon: _jsx(UserCog, { className: "h-4.5 w-4.5" }), permissions: ["manage_users"] },
            { label: "Roles", to: "/roles", icon: _jsx(ShieldCheck, { className: "h-4.5 w-4.5" }), permissions: ["manage_users"] }
        ]
    }
];
function Layout() {
    const { user, logout, can } = useAuth();
    const location = useLocation();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
    useEffect(() => {
        setIsSidebarOpen(false);
        setIsMenuOpen(false);
    }, [location.pathname]);
    const { data: unread } = useQuery({
        queryKey: ["notifications", "unread-count"],
        queryFn: () => api.get("/api/v1/notifications/unread-count"),
        refetchInterval: 6e4,
        enabled: Boolean(user)
    });
    const unreadCount = unread?.unread ?? 0;
    const visibleGroups = NAV_GROUPS.map((group) => ({
        ...group,
        items: group.items.filter((item) => !item.permissions || item.permissions.some((p) => can(p)))
    })).filter((group) => group.items.length > 0);
    const handleLogout = async () => {
        await logout();
        queryClient.clear();
        navigate("/login", { replace: true });
    };
    const currentLabel = visibleGroups.flatMap((group) => group.items).find((item) => item.end ? item.to === location.pathname : location.pathname.startsWith(item.to))?.label ?? "Dashboard";
    return _jsxs("div", { className: "min-h-screen bg-surface", children: [_jsxs("aside", { className: cn("fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-slate-900 transition-transform duration-200 lg:translate-x-0", isSidebarOpen ? "translate-x-0" : "-translate-x-full"), children: [_jsxs("div", { className: "flex h-16 items-center justify-between gap-2 border-b border-white/10 px-5", children: [_jsxs("div", { className: "flex items-center gap-2.5", children: [_jsx("span", { className: "flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-white", children: _jsx(Package, { className: "h-5 w-5" }) }), _jsx("span", { className: "text-base font-semibold text-white", children: "Stockwise" })] }), _jsx("button", { className: "rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white lg:hidden", onClick: () => setIsSidebarOpen(false), "aria-label": "Close navigation", children: _jsx(X, { className: "h-5 w-5" }) })] }), _jsx("nav", { className: "flex-1 space-y-6 overflow-y-auto px-3 py-5", children: visibleGroups.map((group) => _jsxs("div", { children: [_jsx("p", { className: "px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500", children: group.label }), _jsx("div", { className: "space-y-0.5", children: group.items.map((item) => _jsxs(NavLink, { to: item.to, end: item.end, className: ({ isActive }) => cn("nav-link", isActive && "nav-link-active"), children: [item.icon, item.label] }, item.to)) })] }, group.label)) }), _jsx("div", { className: "border-t border-white/10 p-3", children: _jsxs("div", { className: "flex items-center gap-3 rounded-lg px-2 py-2", children: [_jsx("span", { className: "flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-600 text-sm font-semibold text-white", children: initials(user?.fullName ?? user?.username) }), _jsxs("div", { className: "min-w-0 flex-1", children: [_jsx("p", { className: "truncate text-sm font-medium text-white", children: user?.fullName ?? user?.username ?? "Account" }), _jsx("p", { className: "truncate text-xs text-slate-400", children: humanize(user?.role) })] })] }) })] }), isSidebarOpen ? _jsx("div", { className: "fixed inset-0 z-30 bg-slate-900/50 lg:hidden", onClick: () => setIsSidebarOpen(false), "aria-hidden": true }) : null, _jsxs("div", { className: "lg:pl-64", children: [_jsxs("header", { className: "sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b border-slate-200 bg-white/95 px-4 backdrop-blur sm:px-6", children: [_jsxs("div", { className: "flex min-w-0 items-center gap-3", children: [_jsx("button", { className: "rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:hidden", onClick: () => setIsSidebarOpen(true), "aria-label": "Open navigation", children: _jsx(Menu, { className: "h-5 w-5" }) }), _jsx("h1", { className: "truncate text-sm font-semibold text-slate-900", children: currentLabel })] }), _jsxs("div", { className: "relative flex items-center gap-1", children: [_jsxs("button", { className: "relative rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700", onClick: () => setIsNotificationsOpen((open) => !open), "aria-label": `Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ""}`, children: [_jsx(Bell, { className: "h-5 w-5" }), unreadCount > 0 ? _jsx("span", { className: "absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white", children: unreadCount > 99 ? "99+" : unreadCount }) : null] }), _jsxs("button", { className: "flex items-center gap-2 rounded-lg p-1.5 hover:bg-slate-100", onClick: () => setIsMenuOpen((open) => !open), "aria-haspopup": "menu", "aria-expanded": isMenuOpen, children: [_jsx("span", { className: "flex h-8 w-8 items-center justify-center rounded-full bg-brand-600 text-xs font-semibold text-white", children: initials(user?.fullName ?? user?.username) }), _jsx(ChevronDown, { className: "hidden h-4 w-4 text-slate-400 sm:block" })] }), isMenuOpen ? _jsxs(_Fragment, { children: [_jsx("div", { className: "fixed inset-0 z-10", onClick: () => setIsMenuOpen(false), "aria-hidden": true }), _jsxs("div", { className: "absolute right-0 z-20 mt-2 w-56 animate-fade-in overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg", role: "menu", children: [_jsxs("div", { className: "border-b border-slate-100 px-4 py-3", children: [_jsx("p", { className: "truncate text-sm font-medium text-slate-900", children: user?.fullName ?? user?.username }), _jsx("p", { className: "truncate text-xs text-slate-500", children: user?.email }), _jsx("p", { className: "mt-1.5 inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600", children: humanize(user?.role) })] }), _jsxs("button", { className: "flex w-full items-center gap-2 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50", onClick: () => {
                                                            setIsMenuOpen(false);
                                                            navigate("/profile");
                                                        }, role: "menuitem", children: [_jsx(UserCog, { className: "h-4 w-4 text-slate-400" }), "My profile"] }), _jsxs("button", { className: "flex w-full items-center gap-2 border-t border-slate-100 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50", onClick: () => void handleLogout(), role: "menuitem", children: [_jsx(LogOut, { className: "h-4 w-4" }), "Sign out"] })] })] }) : null, _jsx(NotificationPanel, { open: isNotificationsOpen, onClose: () => setIsNotificationsOpen(false) })] })] }), _jsx("main", { className: "p-4 sm:p-6", children: _jsx(Outlet, {}) })] })] });
}
function AuthGate() {
    const { isLoading } = useAuth();
    if (!isLoading)
        return null;
    return _jsx("div", { className: "flex min-h-screen items-center justify-center bg-surface", children: _jsxs("div", { className: "flex flex-col items-center gap-3", children: [_jsx("span", { className: "flex h-12 w-12 items-center justify-center rounded-xl bg-brand-600 text-white", children: _jsx(Package, { className: "h-6 w-6" }) }), _jsx("p", { className: "text-sm text-slate-500", children: "Loading your workspace\u2026" })] }) });
}
export { AuthGate, Layout };
