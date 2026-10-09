import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { KeyRound, Mail, Package, ShieldCheck, User } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/lib/ToastProvider";
import { formatDateTime, humanize, initials } from "@/lib/format";
import { Alert, Button, Card, CardHeader, Field, Input, PageHeader } from "@/components/ui";
function ProfilePage() {
    const { user, refreshUser } = useAuth();
    const toast = useToast();
    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [error, setError] = useState("");
    const changePassword = useMutation({
        mutationFn: () => api.post("/api/v1/auth/change-password", {
            currentPassword,
            newPassword
        }),
        onSuccess: async () => {
            toast.success("Password changed");
            setCurrentPassword("");
            setNewPassword("");
            setConfirmPassword("");
            setError("");
            await refreshUser();
        },
        onError: (cause) => setError(cause.message || "Could not change your password")
    });
    const handleSubmit = () => {
        if (!currentPassword) {
            setError("Enter your current password.");
            return;
        }
        if (newPassword.length < 8) {
            setError("The new password must be at least 8 characters.");
            return;
        }
        if (newPassword !== confirmPassword) {
            setError("The new passwords do not match.");
            return;
        }
        if (newPassword === currentPassword) {
            setError("The new password must be different from the current one.");
            return;
        }
        setError("");
        changePassword.mutate();
    };
    return _jsxs("div", { className: "space-y-5", children: [_jsx(PageHeader, { title: "My profile", description: "Your account details and sign-in security" }), _jsxs("div", { className: "grid gap-4 lg:grid-cols-3", children: [_jsxs(Card, { children: [_jsxs("div", { className: "flex items-center gap-4", children: [_jsx("span", { className: "flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-brand-600 text-xl font-semibold text-white", children: initials(user?.fullName ?? user?.username) }), _jsxs("div", { className: "min-w-0", children: [_jsx("p", { className: "truncate text-base font-semibold text-slate-900", children: user?.fullName ?? "Account" }), _jsxs("p", { className: "truncate text-sm text-slate-500", children: ["@", user?.username] })] })] }), _jsxs("dl", { className: "mt-5 space-y-3 border-t border-slate-100 pt-4 text-sm", children: [_jsxs("div", { className: "flex items-start gap-2.5", children: [_jsx(Mail, { className: "mt-0.5 h-4 w-4 shrink-0 text-slate-400" }), _jsxs("div", { className: "min-w-0", children: [_jsx("dt", { className: "text-xs text-slate-500", children: "Email" }), _jsx("dd", { className: "truncate text-slate-800", children: user?.email })] })] }), _jsxs("div", { className: "flex items-start gap-2.5", children: [_jsx(ShieldCheck, { className: "mt-0.5 h-4 w-4 shrink-0 text-slate-400" }), _jsxs("div", { className: "min-w-0", children: [_jsx("dt", { className: "text-xs text-slate-500", children: "Role" }), _jsx("dd", { className: "text-slate-800", children: humanize(user?.role) })] })] }), _jsxs("div", { className: "flex items-start gap-2.5", children: [_jsx(KeyRound, { className: "mt-0.5 h-4 w-4 shrink-0 text-slate-400" }), _jsxs("div", { className: "min-w-0", children: [_jsx("dt", { className: "text-xs text-slate-500", children: "Permissions" }), _jsxs("dd", { className: "text-slate-800", children: [user?.permissions.length ?? 0, " granted"] })] })] }), _jsxs("div", { className: "flex items-start gap-2.5", children: [_jsx(User, { className: "mt-0.5 h-4 w-4 shrink-0 text-slate-400" }), _jsxs("div", { className: "min-w-0", children: [_jsx("dt", { className: "text-xs text-slate-500", children: "Last sign-in" }), _jsx("dd", { className: "text-slate-800", children: user?.lastLogin ? formatDateTime(user.lastLogin) : "This is your first session" })] })] })] })] }), _jsxs(Card, { className: "lg:col-span-2", padded: false, children: [_jsx(CardHeader, { title: "Change password", description: "Choose something at least 8 characters long that you do not reuse elsewhere" }), _jsxs("div", { className: "space-y-4 p-5", children: [error ? _jsx(Alert, { tone: "danger", children: error }) : null, _jsx(Field, { label: "Current password", htmlFor: "current-password", required: true, children: _jsx(Input, { id: "current-password", type: "password", autoComplete: "current-password", value: currentPassword, onChange: (event) => setCurrentPassword(event.target.value) }) }), _jsxs("div", { className: "grid gap-4 sm:grid-cols-2", children: [_jsx(Field, { label: "New password", htmlFor: "new-password", required: true, children: _jsx(Input, { id: "new-password", type: "password", autoComplete: "new-password", value: newPassword, onChange: (event) => setNewPassword(event.target.value) }) }), _jsx(Field, { label: "Confirm new password", htmlFor: "confirm-password", required: true, children: _jsx(Input, { id: "confirm-password", type: "password", autoComplete: "new-password", value: confirmPassword, onChange: (event) => setConfirmPassword(event.target.value) }) })] }), _jsx(Button, { onClick: handleSubmit, loading: changePassword.isPending, children: "Update password" })] })] })] }), _jsx(Card, { children: _jsxs("div", { className: "flex items-start gap-3", children: [_jsx("span", { className: "rounded-lg bg-slate-100 p-2.5 text-slate-500", children: _jsx(Package, { className: "h-5 w-5" }) }), _jsxs("div", { className: "text-sm text-slate-600", children: [_jsx("p", { className: "font-medium text-slate-900", children: "What your role can do" }), _jsxs("p", { className: "mt-1", children: ["Your access is granted by the ", _jsx("span", { className: "font-medium", children: humanize(user?.role) }), " ", "role and checked by the server on every request. Ask an administrator to change it if you need more or less access."] })] })] }) })] });
}
export { ProfilePage };
