import {
  forwardRef
} from "react";
import { AlertCircle, CheckCircle2, Info, Loader2, X } from "lucide-react";
import { cn } from "@/lib/format";
const BUTTON_VARIANTS = {
  primary: "btn-primary",
  secondary: "btn-secondary",
  danger: "btn-danger",
  ghost: "btn-ghost"
};
const Button = forwardRef(function Button2({ variant = "primary", size = "md", loading = false, icon, className, children, disabled, ...rest }, ref) {
  return <button
    ref={ref}
    disabled={disabled || loading}
    className={cn(
      BUTTON_VARIANTS[variant],
      size === "sm" && "btn-sm",
      className
    )}
    {...rest}
  >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>;
});
function Card({
  children,
  className,
  padded = true
}) {
  return <div className={cn("card", padded && "p-5", className)}>{children}</div>;
}
function CardHeader({
  title,
  description,
  actions
}) {
  return <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        {description ? <p className="mt-0.5 text-xs text-slate-500">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>;
}
function Field({
  label,
  htmlFor,
  error,
  hint,
  required,
  className,
  children
}) {
  return <div className={className}>
      {label ? <label className="label" htmlFor={htmlFor}>
          {label}
          {required ? <span className="ml-0.5 text-red-500">*</span> : null}
        </label> : null}
      {children}
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>;
}
const Input = forwardRef(function Input2({ className, invalid, prefix, ...rest }, ref) {
  if (prefix) {
    return <div className="relative">
        <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-slate-400">
          {prefix}
        </span>
        <input
      ref={ref}
      className={cn("input pl-8", invalid && "input-error", className)}
      {...rest}
    />
      </div>;
  }
  return <input ref={ref} className={cn("input", invalid && "input-error", className)} {...rest} />;
});
const Select = forwardRef(
  function Select2({ className, children, ...rest }, ref) {
    return <select ref={ref} className={cn("input pr-8", className)} {...rest}>
        {children}
      </select>;
  }
);
const Textarea = forwardRef(
  function Textarea2({ className, ...rest }, ref) {
    return <textarea ref={ref} className={cn("input min-h-[80px]", className)} {...rest} />;
  }
);
function Checkbox({
  label,
  description,
  ...rest
}) {
  return <label className="flex cursor-pointer items-start gap-2.5 text-sm">
      <input
    type="checkbox"
    className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
    {...rest}
  />
      <span className="min-w-0">
        <span className="text-slate-700">{label}</span>
        {description ? <span className="block text-xs text-slate-500">{description}</span> : null}
      </span>
    </label>;
}
const BADGE_TONES = {
  neutral: "bg-slate-100 text-slate-700 ring-slate-200",
  success: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  warning: "bg-amber-50 text-amber-700 ring-amber-200",
  danger: "bg-red-50 text-red-700 ring-red-200",
  info: "bg-brand-50 text-brand-700 ring-brand-200",
  brand: "bg-brand-600 text-white ring-brand-600"
};
function Badge({
  children,
  tone = "neutral",
  className
}) {
  return <span
    className={cn(
      "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
      BADGE_TONES[tone],
      className
    )}
  >
      {children}
    </span>;
}
function Alert({
  tone = "info",
  title,
  children,
  onDismiss
}) {
  const config = {
    info: { cls: "bg-brand-50 text-brand-800 border-brand-200", Icon: Info },
    success: { cls: "bg-emerald-50 text-emerald-800 border-emerald-200", Icon: CheckCircle2 },
    warning: { cls: "bg-amber-50 text-amber-800 border-amber-200", Icon: AlertCircle },
    danger: { cls: "bg-red-50 text-red-800 border-red-200", Icon: AlertCircle }
  }[tone];
  const { Icon } = config;
  return <div className={cn("flex items-start gap-3 rounded-lg border p-3.5 text-sm", config.cls)} role="alert">
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        {title ? <p className="font-medium">{title}</p> : null}
        {children ? <div className={cn(title && "mt-0.5")}>{children}</div> : null}
      </div>
      {onDismiss ? <button onClick={onDismiss} className="shrink-0 rounded p-0.5 hover:bg-black/5" aria-label="Dismiss">
          <X className="h-4 w-4" />
        </button> : null}
    </div>;
}
function Spinner({ className }) {
  return <Loader2 className={cn("h-5 w-5 animate-spin text-brand-600", className)} aria-hidden />;
}
function LoadingBlock({ label = "Loading\u2026" }) {
  return <div className="flex items-center justify-center gap-2.5 py-16 text-sm text-slate-500">
      <Spinner />
      {label}
    </div>;
}
function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md"
}) {
  if (!open) return null;
  const widths = { sm: "max-w-md", md: "max-w-lg", lg: "max-w-2xl", xl: "max-w-4xl" };
  return <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-6">
      <div
    className="fixed inset-0 bg-slate-900/50 backdrop-blur-[2px]"
    onClick={onClose}
    aria-hidden
  />
      <div
    role="dialog"
    aria-modal="true"
    aria-label={title}
    className={cn(
      "relative my-8 w-full animate-fade-in rounded-xl border border-slate-200 bg-white shadow-xl",
      widths[size]
    )}
  >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-slate-900">{title}</h2>
            {description ? <p className="mt-0.5 text-sm text-slate-500">{description}</p> : null}
          </div>
          <button
    onClick={onClose}
    className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
    aria-label="Close"
  >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children ? <div className="px-5 py-4">{children}</div> : null}
        {footer ? <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3.5">
            {footer}
          </div> : null}
      </div>
    </div>;
}
function EmptyState({
  title,
  description,
  action,
  icon
}) {
  return <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      {icon ? <div className="mb-3 text-slate-300">{icon}</div> : null}
      <p className="text-sm font-medium text-slate-900">{title}</p>
      {description ? <p className="mt-1 max-w-sm text-sm text-slate-500">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>;
}
function PageHeader({
  title,
  description,
  actions
}) {
  return <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">{title}</h1>
        {description ? <p className="mt-1 text-sm text-slate-500">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>;
}
export {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  Checkbox,
  EmptyState,
  Field,
  Input,
  LoadingBlock,
  Modal,
  PageHeader,
  Select,
  Spinner,
  Textarea
};
