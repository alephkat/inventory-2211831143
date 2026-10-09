import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { forwardRef } from "react";
import { AlertCircle, CheckCircle2, Info, Loader2, X } from "lucide-react";
import { cn } from "@/lib/format";
const BUTTON_VARIANTS = {
    primary: "btn-primary",
    secondary: "btn-secondary",
    danger: "btn-danger",
    ghost: "btn-ghost"
};
const Button = forwardRef(function Button2({ variant = "primary", size = "md", loading = false, icon, className, children, disabled, ...rest }, ref) {
    return _jsxs("button", { ref: ref, disabled: disabled || loading, className: cn(BUTTON_VARIANTS[variant], size === "sm" && "btn-sm", className), ...rest, children: [loading ? _jsx(Loader2, { className: "h-4 w-4 animate-spin", "aria-hidden": true }) : icon, children] });
});
function Card({ children, className, padded = true }) {
    return _jsx("div", { className: cn("card", padded && "p-5", className), children: children });
}
function CardHeader({ title, description, actions }) {
    return _jsxs("div", { className: "flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-5 py-4", children: [_jsxs("div", { className: "min-w-0", children: [_jsx("h2", { className: "text-sm font-semibold text-slate-900", children: title }), description ? _jsx("p", { className: "mt-0.5 text-xs text-slate-500", children: description }) : null] }), actions ? _jsx("div", { className: "flex shrink-0 items-center gap-2", children: actions }) : null] });
}
function Field({ label, htmlFor, error, hint, required, className, children }) {
    return _jsxs("div", { className: className, children: [label ? _jsxs("label", { className: "label", htmlFor: htmlFor, children: [label, required ? _jsx("span", { className: "ml-0.5 text-red-500", children: "*" }) : null] }) : null, children, error ? _jsx("p", { className: "mt-1 text-xs text-red-600", children: error }) : hint ? _jsx("p", { className: "mt-1 text-xs text-slate-500", children: hint }) : null] });
}
const Input = forwardRef(function Input2({ className, invalid, prefix, ...rest }, ref) {
    if (prefix) {
        return _jsxs("div", { className: "relative", children: [_jsx("span", { className: "pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-slate-400", children: prefix }), _jsx("input", { ref: ref, className: cn("input pl-8", invalid && "input-error", className), ...rest })] });
    }
    return _jsx("input", { ref: ref, className: cn("input", invalid && "input-error", className), ...rest });
});
const Select = forwardRef(function Select2({ className, children, ...rest }, ref) {
    return _jsx("select", { ref: ref, className: cn("input pr-8", className), ...rest, children: children });
});
const Textarea = forwardRef(function Textarea2({ className, ...rest }, ref) {
    return _jsx("textarea", { ref: ref, className: cn("input min-h-[80px]", className), ...rest });
});
function Checkbox({ label, description, ...rest }) {
    return _jsxs("label", { className: "flex cursor-pointer items-start gap-2.5 text-sm", children: [_jsx("input", { type: "checkbox", className: "mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-brand-600 focus:ring-brand-500", ...rest }), _jsxs("span", { className: "min-w-0", children: [_jsx("span", { className: "text-slate-700", children: label }), description ? _jsx("span", { className: "block text-xs text-slate-500", children: description }) : null] })] });
}
const BADGE_TONES = {
    neutral: "bg-slate-100 text-slate-700 ring-slate-200",
    success: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    warning: "bg-amber-50 text-amber-700 ring-amber-200",
    danger: "bg-red-50 text-red-700 ring-red-200",
    info: "bg-brand-50 text-brand-700 ring-brand-200",
    brand: "bg-brand-600 text-white ring-brand-600"
};
function Badge({ children, tone = "neutral", className }) {
    return _jsx("span", { className: cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", BADGE_TONES[tone], className), children: children });
}
function Alert({ tone = "info", title, children, onDismiss }) {
    const config = {
        info: { cls: "bg-brand-50 text-brand-800 border-brand-200", Icon: Info },
        success: { cls: "bg-emerald-50 text-emerald-800 border-emerald-200", Icon: CheckCircle2 },
        warning: { cls: "bg-amber-50 text-amber-800 border-amber-200", Icon: AlertCircle },
        danger: { cls: "bg-red-50 text-red-800 border-red-200", Icon: AlertCircle }
    }[tone];
    const { Icon } = config;
    return _jsxs("div", { className: cn("flex items-start gap-3 rounded-lg border p-3.5 text-sm", config.cls), role: "alert", children: [_jsx(Icon, { className: "mt-0.5 h-4 w-4 shrink-0", "aria-hidden": true }), _jsxs("div", { className: "min-w-0 flex-1", children: [title ? _jsx("p", { className: "font-medium", children: title }) : null, children ? _jsx("div", { className: cn(title && "mt-0.5"), children: children }) : null] }), onDismiss ? _jsx("button", { onClick: onDismiss, className: "shrink-0 rounded p-0.5 hover:bg-black/5", "aria-label": "Dismiss", children: _jsx(X, { className: "h-4 w-4" }) }) : null] });
}
function Spinner({ className }) {
    return _jsx(Loader2, { className: cn("h-5 w-5 animate-spin text-brand-600", className), "aria-hidden": true });
}
function LoadingBlock({ label = "Loading\u2026" }) {
    return _jsxs("div", { className: "flex items-center justify-center gap-2.5 py-16 text-sm text-slate-500", children: [_jsx(Spinner, {}), label] });
}
function Modal({ open, onClose, title, description, children, footer, size = "md" }) {
    if (!open)
        return null;
    const widths = { sm: "max-w-md", md: "max-w-lg", lg: "max-w-2xl", xl: "max-w-4xl" };
    return _jsxs("div", { className: "fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-6", children: [_jsx("div", { className: "fixed inset-0 bg-slate-900/50 backdrop-blur-[2px]", onClick: onClose, "aria-hidden": true }), _jsxs("div", { role: "dialog", "aria-modal": "true", "aria-label": title, className: cn("relative my-8 w-full animate-fade-in rounded-xl border border-slate-200 bg-white shadow-xl", widths[size]), children: [_jsxs("div", { className: "flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4", children: [_jsxs("div", { className: "min-w-0", children: [_jsx("h2", { className: "text-base font-semibold text-slate-900", children: title }), description ? _jsx("p", { className: "mt-0.5 text-sm text-slate-500", children: description }) : null] }), _jsx("button", { onClick: onClose, className: "shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600", "aria-label": "Close", children: _jsx(X, { className: "h-4 w-4" }) })] }), children ? _jsx("div", { className: "px-5 py-4", children: children }) : null, footer ? _jsx("div", { className: "flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3.5", children: footer }) : null] })] });
}
function EmptyState({ title, description, action, icon }) {
    return _jsxs("div", { className: "flex flex-col items-center justify-center px-6 py-16 text-center", children: [icon ? _jsx("div", { className: "mb-3 text-slate-300", children: icon }) : null, _jsx("p", { className: "text-sm font-medium text-slate-900", children: title }), description ? _jsx("p", { className: "mt-1 max-w-sm text-sm text-slate-500", children: description }) : null, action ? _jsx("div", { className: "mt-4", children: action }) : null] });
}
function PageHeader({ title, description, actions }) {
    return _jsxs("div", { className: "flex flex-wrap items-end justify-between gap-3", children: [_jsxs("div", { className: "min-w-0", children: [_jsx("h1", { className: "text-xl font-semibold tracking-tight text-slate-900", children: title }), description ? _jsx("p", { className: "mt-1 text-sm text-slate-500", children: description }) : null] }), actions ? _jsx("div", { className: "flex flex-wrap items-center gap-2", children: actions }) : null] });
}
export { Alert, Badge, Button, Card, CardHeader, Checkbox, EmptyState, Field, Input, LoadingBlock, Modal, PageHeader, Select, Spinner, Textarea };
