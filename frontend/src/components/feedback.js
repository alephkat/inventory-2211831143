import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { cn, errorMessage } from "@/lib/format";
import { Alert, Button, Modal } from "./ui.jsx";
function ConfirmDialog({ open, onClose, title, message, confirmLabel = "Confirm", cancelLabel = "Cancel", destructive = false, onConfirm, isConfirming, error }) {
    return _jsxs(Modal, { open: open, onClose: onClose, title: title, size: "sm", footer: _jsxs(_Fragment, { children: [_jsx(Button, { variant: "secondary", onClick: onClose, disabled: isConfirming, children: cancelLabel }), _jsx(Button, { variant: destructive ? "danger" : "primary", onClick: () => void onConfirm(), loading: isConfirming, children: confirmLabel })] }), children: [_jsx("p", { className: "text-sm text-slate-600", children: message }), error ? _jsx("div", { className: "mt-3", children: _jsx(Alert, { tone: "danger", children: errorMessage(error) }) }) : null] });
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
    return _jsxs(Tag, { onClick: onClick, className: cn("card flex items-start gap-4 p-5 text-left", onClick && "transition hover:border-brand-300 hover:shadow-sm"), children: [icon ? _jsx("span", { className: cn("rounded-lg p-2.5", STAT_TONES[tone]), "aria-hidden": true, children: icon }) : null, _jsxs("div", { className: "min-w-0", children: [_jsx("p", { className: "truncate text-xs font-medium uppercase tracking-wide text-slate-500", children: label }), _jsx("p", { className: "tabular mt-1.5 text-2xl font-semibold tracking-tight text-slate-900", children: value }), hint ? _jsx("p", { className: "mt-1 truncate text-xs text-slate-500", children: hint }) : null] })] });
}
export { ConfirmDialog, StatCard };
