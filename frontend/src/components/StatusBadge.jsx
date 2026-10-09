import { Badge } from "./ui.jsx";
import { humanize } from "@/lib/format";
const TONES = {
  // Transactions, orders, receipts, issues
  PENDING: "warning",
  APPROVED: "info",
  COMPLETED: "success",
  ISSUED: "success",
  RECEIVED: "success",
  CONFIRMED: "success",
  SHIPPED: "info",
  DELIVERED: "success",
  PARTIALLY_RECEIVED: "info",
  PARTIALLY_ISSUED: "info",
  ADJUSTED: "success",
  REJECTED: "danger",
  CANCELLED: "neutral",
  DRAFT: "neutral",
  IN_PROGRESS: "info",
  REVIEWED: "info",
  REQUESTED: "warning",
  DISPATCHED: "info",
  IN_TRANSIT: "info",
  // Suppliers & users
  PENDING_APPROVAL: "warning",
  ACTIVE: "success",
  INACTIVE: "neutral",
  SUSPENDED: "danger",
  BLACKLISTED: "danger",
  OUT_OF_STOCK: "danger",
  DISCONTINUED: "neutral",
  // Notifications
  LOW: "neutral",
  MEDIUM: "info",
  HIGH: "warning",
  URGENT: "danger"
};
function StatusBadge({ status, className }) {
  if (!status) return <span className="text-slate-400">—</span>;
  return <Badge tone={TONES[status] ?? "neutral"} className={className}>
      {humanize(status)}
    </Badge>;
}
export {
  StatusBadge
};
