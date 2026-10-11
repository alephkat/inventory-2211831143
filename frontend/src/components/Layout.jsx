import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  Bell,
  Boxes,
  ChevronDown,
  ClipboardList,
  FileBarChart,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  ScrollText,
  ShieldCheck,
  ShoppingCart,
  Truck,
  UserCog,
  Users,
  Warehouse,
  X
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { cn, humanize, initials } from "@/lib/format";
import { NotificationPanel } from "./NotificationPanel.jsx";
const NAV_GROUPS = [
  {
    label: "Overview",
    items: [
      { label: "Dashboard", to: "/", icon: <LayoutDashboard className="h-4.5 w-4.5" />, end: true }
    ]
  },
  {
    label: "Catalog",
    items: [
      {
        label: "Products",
        to: "/products",
        icon: <Package className="h-4.5 w-4.5" />,
        permissions: ["view_inventory"]
      },
      {
        label: "Categories",
        to: "/categories",
        icon: <Archive className="h-4.5 w-4.5" />,
        permissions: ["view_inventory"]
      },
      {
        label: "Suppliers",
        to: "/suppliers",
        icon: <Truck className="h-4.5 w-4.5" />,
        permissions: ["view_suppliers"]
      },
      {
        label: "Customers",
        to: "/customers",
        icon: <Users className="h-4.5 w-4.5" />,
        permissions: ["view_customers"]
      }
    ]
  },
  {
    label: "Inventory",
    items: [
      {
        label: "Warehouses",
        to: "/warehouses",
        icon: <Warehouse className="h-4.5 w-4.5" />,
        permissions: ["view_warehouses"]
      },
      {
        label: "Stock levels",
        to: "/inventory",
        icon: <Boxes className="h-4.5 w-4.5" />,
        permissions: ["view_inventory"]
      },
      {
        label: "Transactions",
        to: "/transactions",
        icon: <ScrollText className="h-4.5 w-4.5" />,
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
        icon: <ShoppingCart className="h-4.5 w-4.5" />,
        permissions: ["view_inventory"]
      },
      {
        label: "Sales orders",
        to: "/sales-orders",
        icon: <ClipboardList className="h-4.5 w-4.5" />,
        permissions: ["view_inventory"]
      }
    ]
  },
  {
    label: "Insights",
    items: [
      {
        label: "Reports",
        to: "/reports",
        icon: <FileBarChart className="h-4.5 w-4.5" />,
        permissions: ["view_reports"]
      },
      {
        label: "Audit log",
        to: "/audit-logs",
        icon: <ShieldCheck className="h-4.5 w-4.5" />,
        permissions: ["view_audit_logs"]
      }
    ]
  },
  {
    label: "Administration",
    items: [
      { label: "Users", to: "/users", icon: <UserCog className="h-4.5 w-4.5" />, permissions: ["manage_users"] }
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
  return <div className="min-h-screen bg-surface">
      {
    /* ------------------------------------------------------------ Sidebar */
  }
      <aside
    className={cn(
      "fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-slate-900 transition-transform duration-200 lg:translate-x-0",
      isSidebarOpen ? "translate-x-0" : "-translate-x-full"
    )}
  >
        <div className="flex h-16 items-center justify-between gap-2 border-b border-white/10 px-5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-white">
              <Package className="h-5 w-5" />
            </span>
            <span className="text-base font-semibold text-white">Stockwise</span>
          </div>
          <button
    className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white lg:hidden"
    onClick={() => setIsSidebarOpen(false)}
    aria-label="Close navigation"
  >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="no-scrollbar flex-1 space-y-6 overflow-y-auto px-3 py-5">
          {visibleGroups.map((group) => <div key={group.label}>
              <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                {group.label}
              </p>
              <div className="space-y-0.5">
                {group.items.map((item) => <NavLink
    key={item.to}
    to={item.to}
    end={item.end}
    className={({ isActive }) => cn("nav-link", isActive && "nav-link-active")}
  >
                    {item.icon}
                    {item.label}
                  </NavLink>)}
              </div>
            </div>)}
        </nav>

        <div className="border-t border-white/10 p-3">
          <div className="flex items-center gap-3 rounded-lg px-2 py-2">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-600 text-sm font-semibold text-white">
              {initials(user?.fullName ?? user?.username)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-white">
                {user?.fullName ?? user?.username ?? "Account"}
              </p>
              <p className="truncate text-xs text-slate-400">{humanize(user?.role)}</p>
            </div>
          </div>
        </div>
      </aside>

      {isSidebarOpen ? <div
    className="fixed inset-0 z-30 bg-slate-900/50 lg:hidden"
    onClick={() => setIsSidebarOpen(false)}
    aria-hidden
  /> : null}

      {
    /* --------------------------------------------------------------- Main */
  }
      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b border-slate-200 bg-white/95 px-4 backdrop-blur sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button
    className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:hidden"
    onClick={() => setIsSidebarOpen(true)}
    aria-label="Open navigation"
  >
              <Menu className="h-5 w-5" />
            </button>
            <h1 className="truncate text-sm font-semibold text-slate-900">{currentLabel}</h1>
          </div>

          <div className="relative flex items-center gap-1">
            <button
    className="relative z-40 rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
    onClick={() => setIsNotificationsOpen((open) => !open)}
    aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ""}`}
    aria-expanded={isNotificationsOpen}
  >
              <Bell className="h-5 w-5" />
              {unreadCount > 0 ? <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span> : null}
            </button>

            <button
    className="flex items-center gap-2 rounded-lg p-1.5 hover:bg-slate-100"
    onClick={() => setIsMenuOpen((open) => !open)}
    aria-haspopup="menu"
    aria-expanded={isMenuOpen}
  >
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-600 text-xs font-semibold text-white">
                {initials(user?.fullName ?? user?.username)}
              </span>
              <ChevronDown className="hidden h-4 w-4 text-slate-400 sm:block" />
            </button>

            {isMenuOpen ? <>
                <div className="fixed inset-0 z-10" onClick={() => setIsMenuOpen(false)} aria-hidden />
                <div
    className="absolute right-0 z-20 mt-2 w-56 animate-fade-in overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg"
    role="menu"
  >
                  <div className="border-b border-slate-100 px-4 py-3">
                    <p className="truncate text-sm font-medium text-slate-900">
                      {user?.fullName ?? user?.username}
                    </p>
                    <p className="truncate text-xs text-slate-500">{user?.email}</p>
                    <p className="mt-1.5 inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                      {humanize(user?.role)}
                    </p>
                  </div>
                  <button
    className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50"
    onClick={() => {
      setIsMenuOpen(false);
      navigate("/profile");
    }}
    role="menuitem"
  >
                    <UserCog className="h-4 w-4 text-slate-400" />
                    My profile
                  </button>
                  <button
    className="flex w-full items-center gap-2 border-t border-slate-100 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50"
    onClick={() => void handleLogout()}
    role="menuitem"
  >
                    <LogOut className="h-4 w-4" />
                    Sign out
                  </button>
                </div>
              </> : null}

            <NotificationPanel
    open={isNotificationsOpen}
    onClose={() => setIsNotificationsOpen(false)}
  />
          </div>
        </header>

        <main className="p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>;
}
function AuthGate() {
  const { isLoading } = useAuth();
  if (!isLoading) return null;
  return <div className="flex min-h-screen items-center justify-center bg-surface">
      <div className="flex flex-col items-center gap-3">
        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-600 text-white">
          <Package className="h-6 w-6" />
        </span>
        <p className="text-sm text-slate-500">Loading your workspace…</p>
      </div>
    </div>;
}
export {
  AuthGate,
  Layout
};
