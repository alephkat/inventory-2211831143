import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Link } from "react-router-dom";
import { Compass } from "lucide-react";
import { Button } from "@/components/ui";
function NotFoundPage() {
    return _jsxs("div", { className: "flex min-h-screen flex-col items-center justify-center bg-surface px-6 text-center", children: [_jsx("span", { className: "flex h-14 w-14 items-center justify-center rounded-xl bg-brand-600 text-white", children: _jsx(Compass, { className: "h-7 w-7" }) }), _jsx("p", { className: "mt-6 text-5xl font-semibold tracking-tight text-slate-900", children: "404" }), _jsx("h1", { className: "mt-2 text-lg font-medium text-slate-700", children: "This page does not exist" }), _jsx("p", { className: "mt-1.5 max-w-sm text-sm text-slate-500", children: "The link may be out of date, or the record it pointed at has been deleted." }), _jsxs("div", { className: "mt-6 flex gap-2", children: [_jsx(Link, { to: "/", children: _jsx(Button, { children: "Back to dashboard" }) }), _jsx(Button, { variant: "secondary", onClick: () => window.history.back(), children: "Go back" })] })] });
}
export { NotFoundPage };
