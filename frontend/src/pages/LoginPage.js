import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Package } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { errorMessage } from "@/lib/format";
import { Alert, Button, Field, Input } from "@/components/ui";
function LoginPage() {
    const { login, isAuthenticated, isLoading } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const queryClient = useQueryClient();
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    if (isAuthenticated)
        return _jsx(Navigate, { to: "/", replace: true });
    const redirectTo = location.state?.from ?? "/";
    const handleSubmit = async (event) => {
        event.preventDefault();
        setError("");
        if (!username.trim() || !password) {
            setError("Enter both your username and password.");
            return;
        }
        setIsSubmitting(true);
        try {
            await login(username.trim(), password);
            queryClient.clear();
            navigate(redirectTo, { replace: true });
        }
        catch (cause) {
            setError(errorMessage(cause, "Could not sign in. Please try again."));
        }
        finally {
            setIsSubmitting(false);
        }
    };
    return _jsxs("div", { className: "flex min-h-screen bg-slate-900", children: [_jsxs("div", { className: "relative hidden flex-1 flex-col justify-between overflow-hidden p-12 lg:flex", children: [_jsx("div", { className: "absolute inset-0 opacity-90", style: {
                            background: "radial-gradient(circle at 20% 20%, #1e40af 0%, transparent 55%), radial-gradient(circle at 80% 70%, #0f766e 0%, transparent 50%)"
                        }, "aria-hidden": true }), _jsxs("div", { className: "relative flex items-center gap-3", children: [_jsx("span", { className: "flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 text-white backdrop-blur", children: _jsx(Package, { className: "h-6 w-6" }) }), _jsx("span", { className: "text-xl font-semibold text-white", children: "Stockwise" })] }), _jsxs("div", { className: "relative max-w-md", children: [_jsx("h1", { className: "text-4xl font-semibold leading-tight text-white", children: "Every unit, accounted for." }), _jsx("p", { className: "mt-4 text-base leading-relaxed text-blue-100/80", children: "Track products, stock levels and warehouse movements across your whole operation \u2014 with a full audit trail behind every change." }), _jsx("dl", { className: "mt-10 grid grid-cols-3 gap-6", children: [
                                    { value: "Live", label: "stock levels" },
                                    { value: "Multi", label: "warehouse" },
                                    { value: "Full", label: "audit trail" }
                                ].map((item) => _jsxs("div", { children: [_jsx("dt", { className: "text-2xl font-semibold text-white", children: item.value }), _jsx("dd", { className: "text-xs uppercase tracking-wide text-blue-200/70", children: item.label })] }, item.label)) })] }), _jsx("p", { className: "relative text-xs text-blue-200/50", children: "Inventory Management System" })] }), _jsx("div", { className: "flex w-full items-center justify-center bg-white px-6 py-12 sm:px-12 lg:w-[30rem] lg:shrink-0", children: _jsxs("div", { className: "w-full max-w-sm", children: [_jsxs("div", { className: "mb-8 flex items-center gap-2.5 lg:hidden", children: [_jsx("span", { className: "flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-white", children: _jsx(Package, { className: "h-5 w-5" }) }), _jsx("span", { className: "text-lg font-semibold text-slate-900", children: "Stockwise" })] }), _jsx("h2", { className: "text-2xl font-semibold tracking-tight text-slate-900", children: "Sign in" }), _jsx("p", { className: "mt-1.5 text-sm text-slate-500", children: "Use your inventory team account to continue." }), _jsxs("form", { onSubmit: handleSubmit, className: "mt-8 space-y-4", noValidate: true, children: [error ? _jsx(Alert, { tone: "danger", children: error }) : null, _jsx(Field, { label: "Username", htmlFor: "username", required: true, children: _jsx(Input, { id: "username", name: "username", autoComplete: "username", autoFocus: true, value: username, onChange: (event) => setUsername(event.target.value), placeholder: "admin", disabled: isSubmitting }) }), _jsx(Field, { label: "Password", htmlFor: "password", required: true, children: _jsx(Input, { id: "password", name: "password", type: "password", autoComplete: "current-password", value: password, onChange: (event) => setPassword(event.target.value), placeholder: "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022", disabled: isSubmitting }) }), _jsx(Button, { type: "submit", className: "w-full", loading: isSubmitting, children: isSubmitting ? "Signing in\u2026" : "Sign in" }), isLoading ? _jsxs("p", { className: "flex items-center justify-center gap-2 text-xs text-slate-400", children: [_jsx(Loader2, { className: "h-3 w-3 animate-spin" }), "Restoring your session\u2026"] }) : null] })] }) })] });
}
export { LoginPage };
