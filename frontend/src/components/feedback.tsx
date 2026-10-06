import type { ReactNode } from 'react';
import { cn, errorMessage } from '@/lib/format';
import { Alert, Button, Modal } from './ui';

export interface ConfirmRequest {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => Promise<void> | void;
}

interface ConfirmDialogProps extends ConfirmRequest {
  open: boolean;
  onClose: () => void;
  isConfirming: boolean;
  error: unknown;
}

/**
 * Destructive-action confirmation. Surfaces the server's error inside the
 * dialog instead of closing, so a rejected action explains itself.
 */
export function ConfirmDialog({
  open,
  onClose,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  onConfirm,
  isConfirming,
  error,
}: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isConfirming}>
            {cancelLabel}
          </Button>
          <Button
            variant={destructive ? 'danger' : 'primary'}
            onClick={() => void onConfirm()}
            loading={isConfirming}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-sm text-slate-600">{message}</p>
      {error ? (
        <div className="mt-3">
          <Alert tone="danger">{errorMessage(error)}</Alert>
        </div>
      ) : null}
    </Modal>
  );
}

interface StatCardProps {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  hint?: string;
  tone?: 'default' | 'success' | 'warning' | 'danger' | 'brand';
  onClick?: () => void;
}

const STAT_TONES = {
  default: 'text-slate-500 bg-slate-100',
  success: 'text-emerald-600 bg-emerald-50',
  warning: 'text-amber-600 bg-amber-50',
  danger: 'text-red-600 bg-red-50',
  brand: 'text-brand-600 bg-brand-50',
} as const;

export function StatCard({ label, value, icon, hint, tone = 'default', onClick }: StatCardProps) {
  const Tag = onClick ? 'button' : 'div';

  return (
    <Tag
      onClick={onClick}
      className={cn(
        'card flex items-start gap-4 p-5 text-left',
        onClick && 'transition hover:border-brand-300 hover:shadow-sm',
      )}
    >
      {icon ? (
        <span className={cn('rounded-lg p-2.5', STAT_TONES[tone])} aria-hidden>
          {icon}
        </span>
      ) : null}
      <div className="min-w-0">
        <p className="truncate text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
        <p className="tabular mt-1.5 text-2xl font-semibold tracking-tight text-slate-900">{value}</p>
        {hint ? <p className="mt-1 truncate text-xs text-slate-500">{hint}</p> : null}
      </div>
    </Tag>
  );
}