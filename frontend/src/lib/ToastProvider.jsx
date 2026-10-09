import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState
} from "react";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import { cn, errorMessage } from "@/lib/format";
const ToastContext = createContext(null);
const TONE_STYLES = {
  success: "border-emerald-200 bg-white text-emerald-800",
  error: "border-red-200 bg-white text-red-800",
  info: "border-slate-200 bg-white text-slate-800"
};
const TONE_ICONS = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info
};
function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const nextId = useRef(0);
  const dismiss = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);
  const push = useCallback(
    (tone, message) => {
      const id = nextId.current++;
      setToasts((current) => [...current, { id, tone, message }]);
      window.setTimeout(() => dismiss(id), tone === "error" ? 7e3 : 4e3);
    },
    [dismiss]
  );
  const value = useMemo(
    () => ({
      success: (message) => push("success", message),
      error: (cause, fallback = "Something went wrong") => push("error", errorMessage(cause, fallback)),
      info: (message) => push("info", message)
    }),
    [push]
  );
  return <ToastContext.Provider value={value}>
      {children}
      <div
    className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-full max-w-sm flex-col gap-2"
    role="status"
    aria-live="polite"
  >
        {toasts.map((toast) => {
    const Icon = TONE_ICONS[toast.tone];
    return <div
      key={toast.id}
      className={cn(
        "pointer-events-auto flex animate-fade-in items-start gap-3 rounded-lg border p-3.5 shadow-lg",
        TONE_STYLES[toast.tone]
      )}
    >
              <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <p className="min-w-0 flex-1 text-sm">{toast.message}</p>
              <button
      onClick={() => dismiss(toast.id)}
      className="shrink-0 rounded p-0.5 hover:bg-black/5"
      aria-label="Dismiss notification"
    >
                <X className="h-4 w-4" />
              </button>
            </div>;
  })}
      </div>
    </ToastContext.Provider>;
}
function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside <ToastProvider>");
  return context;
}
export {
  ToastProvider,
  useToast
};
