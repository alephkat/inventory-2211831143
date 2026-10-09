function cn(...classes) {
  return classes.filter(Boolean).join(" ");
}
const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});
const compactFormatter = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1
});
function formatCurrency(value) {
  if (value == null || Number.isNaN(value)) return "\u2014";
  return currencyFormatter.format(value);
}
function formatNumber(value) {
  if (value == null || Number.isNaN(value)) return "\u2014";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 3 }).format(value);
}
function formatCompact(value) {
  if (value == null || Number.isNaN(value)) return "\u2014";
  return compactFormatter.format(value);
}
function formatDate(value) {
  if (!value) return "\u2014";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "\u2014";
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "2-digit" });
}
function formatDateTime(value) {
  if (!value) return "\u2014";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "\u2014";
  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}
function formatRelative(value) {
  if (!value) return "\u2014";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "\u2014";
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.round(diffMs / 6e4);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(date);
}
function initials(name) {
  if (!name) return "IT";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "IT";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}
function humanize(value) {
  if (!value) return "\u2014";
  return value.toLowerCase().split("_").filter(Boolean).map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}
function errorMessage(error, fallback = "Something went wrong") {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  return fallback;
}
export {
  cn,
  errorMessage,
  formatCompact,
  formatCurrency,
  formatDate,
  formatDateTime,
  formatNumber,
  formatRelative,
  humanize,
  initials
};
