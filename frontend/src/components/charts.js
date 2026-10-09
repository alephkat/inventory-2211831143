import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatCompact } from "@/lib/format";
import { EmptyState } from "./ui.jsx";
const CHART_COLORS = ["#2563eb", "#16a34a", "#d97706", "#dc2626", "#7c3aed", "#0891b2", "#db2777", "#65a30d"];
const AXIS_PROPS = {
    stroke: "#94a3b8",
    fontSize: 11,
    tickLine: false
};
const TOOLTIP_STYLE = {
    contentStyle: {
        borderRadius: 8,
        border: "1px solid #e2e8f0",
        fontSize: 12,
        boxShadow: "0 4px 12px rgb(15 23 42 / 0.08)"
    }
};
const CHART_HEIGHT = 288;
function StockMovementChart({ labels, received, issued }) {
    const data = labels.map((label, index) => ({
        label: label.slice(5),
        // YYYY-MM-DD -> MM-DD
        received: received[index] ?? 0,
        issued: issued[index] ?? 0
    }));
    if (data.length === 0) {
        return _jsx(EmptyState, { title: "No movements yet", description: "Stock movements will appear here once recorded." });
    }
    return _jsx("div", { style: { height: CHART_HEIGHT }, children: _jsx(ResponsiveContainer, { width: "100%", height: "100%", children: _jsxs(AreaChart, { data: data, margin: { top: 8, right: 8, left: -18, bottom: 0 }, children: [_jsxs("defs", { children: [_jsxs("linearGradient", { id: "gradientReceived", x1: "0", y1: "0", x2: "0", y2: "1", children: [_jsx("stop", { offset: "0%", stopColor: "#16a34a", stopOpacity: 0.28 }), _jsx("stop", { offset: "100%", stopColor: "#16a34a", stopOpacity: 0.02 })] }), _jsxs("linearGradient", { id: "gradientIssued", x1: "0", y1: "0", x2: "0", y2: "1", children: [_jsx("stop", { offset: "0%", stopColor: "#d97706", stopOpacity: 0.28 }), _jsx("stop", { offset: "100%", stopColor: "#d97706", stopOpacity: 0.02 })] })] }), _jsx(CartesianGrid, { strokeDasharray: "3 3", stroke: "#f1f5f9", vertical: false }), _jsx(XAxis, { dataKey: "label", ...AXIS_PROPS }), _jsx(YAxis, { ...AXIS_PROPS, tickFormatter: formatCompact, width: 52 }), _jsx(Tooltip, { ...TOOLTIP_STYLE }), _jsx(Legend, { wrapperStyle: { fontSize: 12 } }), _jsx(Area, { type: "monotone", dataKey: "received", name: "Received", stroke: "#16a34a", strokeWidth: 2, fill: "url(#gradientReceived)" }), _jsx(Area, { type: "monotone", dataKey: "issued", name: "Issued", stroke: "#d97706", strokeWidth: 2, fill: "url(#gradientIssued)" })] }) }) });
}
function InventoryValueChart({ data }) {
    if (data.length === 0) {
        return _jsx(EmptyState, { title: "No valuation data", description: "Stock value appears once products are stocked." });
    }
    return _jsx("div", { style: { height: CHART_HEIGHT }, children: _jsx(ResponsiveContainer, { width: "100%", height: "100%", children: _jsxs(PieChart, { children: [_jsx(Pie, { data: data, dataKey: "value", nameKey: "label", cx: "50%", cy: "50%", outerRadius: 96, innerRadius: 52, paddingAngle: 2, children: data.map((entry, index) => _jsx(Cell, { fill: CHART_COLORS[index % CHART_COLORS.length] }, entry.label)) }), _jsx(Tooltip, { ...TOOLTIP_STYLE, formatter: (value) => `$${value.toLocaleString()}` }), _jsx(Legend, { wrapperStyle: { fontSize: 11 } })] }) }) });
}
function TopProductsChart({ data }) {
    if (data.length === 0) {
        return _jsx(EmptyState, { title: "Nothing issued yet", description: "Issued quantities will be ranked here." });
    }
    return _jsx("div", { style: { height: CHART_HEIGHT }, children: _jsx(ResponsiveContainer, { width: "100%", height: "100%", children: _jsxs(BarChart, { data: data, layout: "vertical", margin: { top: 8, right: 16, left: 8, bottom: 0 }, children: [_jsx(CartesianGrid, { strokeDasharray: "3 3", stroke: "#f1f5f9", horizontal: false }), _jsx(XAxis, { type: "number", ...AXIS_PROPS, tickFormatter: formatCompact }), _jsx(YAxis, { type: "category", dataKey: "label", ...AXIS_PROPS, width: 120 }), _jsx(Tooltip, { ...TOOLTIP_STYLE, cursor: { fill: "#f8fafc" } }), _jsx(Bar, { dataKey: "value", name: "Issued", radius: [0, 4, 4, 0], fill: "#2563eb", maxBarSize: 22 })] }) }) });
}
export { InventoryValueChart, StockMovementChart, TopProductsChart };
