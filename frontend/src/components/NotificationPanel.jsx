import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck, X } from "lucide-react";
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
  if (!open) return null;
  return <>
      <div className="fixed inset-0 z-30" onClick={onClose} aria-hidden />
      <div className="absolute right-0 z-40 mt-2 w-[22rem] max-w-[calc(100vw-1.5rem)] animate-fade-in overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
        <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
          <p className="text-sm font-semibold text-slate-900">Notifications</p>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => markAllRead.mutate()}
              loading={markAllRead.isPending}
              disabled={list.items.length === 0}
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Mark all read
            </Button>
            <button
              className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              onClick={onClose}
              aria-label="Close notifications"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="max-h-96 overflow-y-auto">
          {isLoading ? <p className="px-4 py-10 text-center text-sm text-slate-500">Loading…</p> : list.items.length === 0 ? <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
              <Bell className="h-8 w-8 text-slate-300" />
              <p className="text-sm text-slate-500">You are all caught up.</p>
            </div> : <ul className="divide-y divide-slate-100">
              {list.items.map((notification) => <li
    key={notification.id}
    className={notification.isRead ? "px-4 py-3" : "bg-brand-50/40 px-4 py-3 hover:bg-brand-50/70"}
  >
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 flex-1 text-sm font-medium text-slate-900">
                      {notification.title}
                    </p>
                    {!notification.isRead ? <button
    className="shrink-0 rounded p-1 text-slate-400 hover:bg-white hover:text-slate-600"
    onClick={() => markRead.mutate(notification.id)}
    aria-label={`Mark "${notification.title}" as read`}
  >
                        <CheckCheck className="h-3.5 w-3.5" />
                      </button> : null}
                  </div>
                  <p className="mt-0.5 text-xs leading-relaxed text-slate-600">{notification.body}</p>
                  <div className="mt-1.5 flex items-center gap-2">
                    <Badge tone={PRIORITY_TONE[notification.priority] ?? "neutral"}>
                      {humanize(notification.priority)}
                    </Badge>
                    <span className="text-[11px] text-slate-400">
                      {formatRelative(notification.createdAt)}
                    </span>
                  </div>
                </li>)}
            </ul>}
        </div>
      </div>
    </>;
}
export {
  NotificationPanel
};
