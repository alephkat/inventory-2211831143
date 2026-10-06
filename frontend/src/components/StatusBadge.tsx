import { Badge } from './ui';
import { humanize } from '@/lib/format';

/**
 * Maps every workflow status the backend can emit onto a colour.
 *
 * Unknown values fall through to a neutral badge rather than disappearing, so
 * a new status added server-side is visible instead of silently rendering blank.
 */
const TONES: Record<string, 'neutral' | 'success' | 'warning' | 'danger' | 'info'> = {
  // Transactions, orders, receipts, issues
  PENDING: 'warning',
  APPROVED: 'info',
  COMPLETED: 'success',
  ISSUED: 'success',
  RECEIVED: 'success',
  CONFIRMED: 'success',
  SHIPPED: 'info',
  DELIVERED: 'success',
  PARTIALLY_RECEIVED: 'info',
  PARTIALLY_ISSUED: 'info',
  ADJUSTED: 'success',
  REJECTED: 'danger',
  CANCELLED: 'neutral',
  DRAFT: 'neutral',
  IN_PROGRESS: 'info',
  REVIEWED: 'info',
  REQUESTED: 'warning',
  DISPATCHED: 'info',
  IN_TRANSIT: 'info',

  // Suppliers & users
  PENDING_APPROVAL: 'warning',
  ACTIVE: 'success',
  INACTIVE: 'neutral',
  SUSPENDED: 'danger',
  BLACKLISTED: 'danger',
  OUT_OF_STOCK: 'danger',
  DISCONTINUED: 'neutral',

  // Notifications
  LOW: 'neutral',
  MEDIUM: 'info',
  HIGH: 'warning',
  URGENT: 'danger',
};

export function StatusBadge({ status, className }: { status?: string | null; className?: string }) {
  if (!status) return <span className="text-slate-400">—</span>;
  return (
    <Badge tone={TONES[status] ?? 'neutral'} className={className}>
      {humanize(status)}
    </Badge>
  );
}