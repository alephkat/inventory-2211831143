import { cn, errorMessage } from "@/lib/format";
import { Alert, Button, Modal } from "./ui.jsx";
function ConfirmDialog({
  open,
  onClose,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  onConfirm,
  isConfirming,
  error
}) {
  return <Modal
    open={open}
    onClose={onClose}
    title={title}
    size="sm"
    footer={<>
          <Button variant="secondary" onClick={onClose} disabled={isConfirming}>
            {cancelLabel}
          </Button>
          <Button
      variant={destructive ? "danger" : "primary"}
      onClick={() => void onConfirm()}
      loading={isConfirming}
    >
            {confirmLabel}
          </Button>
        </>}
  >
      <p className="text-sm text-slate-600">{message}</p>
      {error ? <div className="mt-3">
          <Alert tone="danger">{errorMessage(error)}</Alert>
        </div> : null}
    </Modal>;
}
const STAT_TONES = {
  default: "text-slate-500 bg-slate-100",
  success: "text-emerald-600 bg-emerald-50",
  warning: "text-amber-600 bg-amber-50",
  danger: "text-red-600 bg-red-50",
  brand: "text-brand-600 bg-brand-50"
};
function StatCard({ label, value, icon, hint, tone = "default", onClick }) {
  const Tag = onClick ? "button" : "div";
  return <Tag
    onClick={onClick}
    className={cn(
      "card flex items-start gap-4 p-5 text-left",
      onClick && "transition hover:border-brand-300 hover:shadow-sm"
    )}
  >
      {icon ? <span className={cn("rounded-lg p-2.5", STAT_TONES[tone])} aria-hidden>
          {icon}
        </span> : null}
      <div className="min-w-0">
        <p className="truncate text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
        <p className="tabular mt-1.5 text-2xl font-semibold tracking-tight text-slate-900">{value}</p>
        {hint ? <p className="mt-1 truncate text-xs text-slate-500">{hint}</p> : null}
      </div>
    </Tag>;
}
export {
  ConfirmDialog,
  StatCard
};
