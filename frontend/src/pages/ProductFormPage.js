import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Save } from "lucide-react";
import { api, normalizeList } from "@/lib/api";
import { useToast } from "@/lib/ToastProvider";
import { errorMessage } from "@/lib/format";
import { Alert, Button, Card, CardHeader, Field, Input, LoadingBlock, PageHeader, Select, Textarea } from "@/components/ui";
import { UNITS } from "@/types";
const EMPTY_FORM = {
    sku: "",
    barcode: "",
    name: "",
    description: "",
    categoryId: "",
    brand: "",
    unit: "PIECE",
    costPrice: "0",
    sellingPrice: "0",
    minStockLevel: "0",
    maxStockLevel: "",
    reorderLevel: "0",
    supplierId: "",
    warehouseId: "",
    batchNumber: "",
    serialNumber: "",
    manufacturingDate: "",
    expiryDate: "",
    status: "ACTIVE"
};
const toDateInput = (value) => {
    if (!value)
        return "";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
};
const toNullable = (value) => value.trim() === "" ? null : value.trim();
const toNullableNumber = (value) => value.trim() === "" ? null : Number(value);
const toNumber = (value) => Number(value) || 0;
function ProductFormPage() {
    const { id } = useParams();
    const isEdit = Boolean(id);
    const navigate = useNavigate();
    const toast = useToast();
    const queryClient = useQueryClient();
    const [form, setForm] = useState(EMPTY_FORM);
    const [errors, setErrors] = useState({});
    const product = useQuery({
        queryKey: ["products", "detail", id],
        queryFn: () => api.get(`/api/v1/products/${id}`),
        enabled: isEdit
    });
    const categories = useQuery({
        queryKey: ["categories", "all"],
        queryFn: () => api.get("/api/v1/categories")
    });
    const suppliers = useQuery({
        queryKey: ["suppliers", "all"],
        queryFn: () => api.get("/api/v1/suppliers")
    });
    const warehouses = useQuery({
        queryKey: ["warehouses", "all"],
        queryFn: () => api.get("/api/v1/warehouses")
    });
    useEffect(() => {
        if (!product.data)
            return;
        const p = product.data;
        setForm({
            sku: p.sku ?? "",
            barcode: p.barcode ?? "",
            name: p.name ?? "",
            description: p.description ?? "",
            categoryId: p.categoryId ?? "",
            brand: p.brand ?? "",
            unit: p.unit ?? "PIECE",
            costPrice: String(p.costPrice ?? 0),
            sellingPrice: String(p.sellingPrice ?? 0),
            minStockLevel: String(p.minStockLevel ?? 0),
            maxStockLevel: p.maxStockLevel == null ? "" : String(p.maxStockLevel),
            reorderLevel: String(p.reorderLevel ?? 0),
            supplierId: p.supplierId ?? "",
            warehouseId: p.warehouseId ?? "",
            batchNumber: p.batchNumber ?? "",
            serialNumber: p.serialNumber ?? "",
            manufacturingDate: toDateInput(p.manufacturingDate),
            expiryDate: toDateInput(p.expiryDate),
            status: p.status ?? "ACTIVE"
        });
    }, [product.data]);
    const mutation = useMutation({
        mutationFn: (payload) => isEdit ? api.put(`/api/v1/products/${id}`, payload) : api.post("/api/v1/products", payload),
        onSuccess: () => {
            toast.success(isEdit ? "Product updated" : "Product created");
            void queryClient.invalidateQueries({ queryKey: ["products"] });
            void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
            navigate("/products");
        },
        onError: (error) => toast.error(error, "Could not save the product")
    });
    const update = (key) => (event) => {
        setForm((current) => ({ ...current, [key]: event.target.value }));
        setErrors((current) => ({ ...current, [key]: void 0 }));
    };
    const validate = () => {
        const next = {};
        if (!form.name.trim())
            next.name = "Product name is required.";
        if (!form.sku.trim())
            next.sku = "SKU is required.";
        if (!form.categoryId)
            next.categoryId = "Choose a category.";
        if (!form.supplierId)
            next.supplierId = "Choose a supplier.";
        if (form.costPrice === "" || Number(form.costPrice) < 0) {
            next.costPrice = "Enter zero or a positive amount.";
        }
        if (form.sellingPrice === "" || Number(form.sellingPrice) < 0) {
            next.sellingPrice = "Enter zero or a positive amount.";
        }
        const min = Number(form.minStockLevel || 0);
        const max = form.maxStockLevel === "" ? null : Number(form.maxStockLevel);
        const reorder = Number(form.reorderLevel || 0);
        if (min < 0 || reorder < 0) {
            next.minStockLevel = "Levels cannot be negative.";
        }
        if (max != null && max < min) {
            next.maxStockLevel = "Maximum must be greater than or equal to the minimum.";
        }
        if (reorder < min) {
            next.reorderLevel = "Reorder level should not be below the minimum.";
        }
        if (form.manufacturingDate && form.expiryDate && new Date(form.expiryDate) <= new Date(form.manufacturingDate)) {
            next.expiryDate = "Expiry must be after the manufacturing date.";
        }
        setErrors(next);
        return Object.keys(next).length === 0;
    };
    const handleSubmit = (event) => {
        event.preventDefault();
        if (!validate())
            return;
        mutation.mutate({
            sku: form.sku.trim(),
            barcode: toNullable(form.barcode),
            name: form.name.trim(),
            description: toNullable(form.description),
            categoryId: form.categoryId,
            brand: toNullable(form.brand),
            unit: form.unit,
            costPrice: toNumber(form.costPrice),
            sellingPrice: toNumber(form.sellingPrice),
            minStockLevel: toNumber(form.minStockLevel),
            maxStockLevel: toNullableNumber(form.maxStockLevel),
            reorderLevel: toNumber(form.reorderLevel),
            supplierId: form.supplierId,
            warehouseId: form.warehouseId ? form.warehouseId : null,
            batchNumber: toNullable(form.batchNumber),
            serialNumber: toNullable(form.serialNumber),
            manufacturingDate: toNullable(form.manufacturingDate),
            expiryDate: toNullable(form.expiryDate),
            status: form.status
        });
    };
    const categoryOptions = normalizeList(categories.data).items;
    const supplierOptions = normalizeList(suppliers.data).items;
    const warehouseOptions = normalizeList(warehouses.data).items;
    const activeSuppliers = useMemo(() => supplierOptions.filter((supplier) => supplier.status === "ACTIVE"), [supplierOptions]);
    if (isEdit && product.isLoading)
        return _jsx(LoadingBlock, { label: "Loading product\u2026" });
    if (isEdit && product.error) {
        return _jsxs("div", { className: "space-y-4", children: [_jsx(Alert, { tone: "danger", children: errorMessage(product.error, "Product not found") }), _jsx(Button, { variant: "secondary", icon: _jsx(ArrowLeft, { className: "h-4 w-4" }), onClick: () => navigate("/products"), children: "Back to products" })] });
    }
    const missingReferences = categoryOptions.length === 0 || activeSuppliers.length === 0;
    return _jsxs("form", { onSubmit: handleSubmit, className: "space-y-5", noValidate: true, children: [_jsx(PageHeader, { title: isEdit ? "Edit product" : "New product", description: isEdit ? `Update ${product.data?.name ?? "this product"}` : "Add an item to your catalog", actions: _jsxs(_Fragment, { children: [_jsx(Button, { type: "button", variant: "secondary", onClick: () => navigate("/products"), children: "Cancel" }), _jsx(Button, { type: "submit", icon: _jsx(Save, { className: "h-4 w-4" }), loading: mutation.isPending, children: isEdit ? "Save changes" : "Create product" })] }) }), mutation.error ? _jsx(Alert, { tone: "danger", children: errorMessage(mutation.error) }) : null, missingReferences ? _jsxs(Alert, { tone: "warning", title: "Some required lists are empty", children: ["A product needs one category and one approved supplier.", " ", categoryOptions.length === 0 ? _jsx("button", { type: "button", className: "font-medium underline", onClick: () => navigate("/categories"), children: "Create a category" }) : null, activeSuppliers.length === 0 ? _jsx("button", { type: "button", className: "font-medium underline", onClick: () => navigate("/suppliers"), children: "Approve a supplier" }) : null] }) : null, _jsxs(Card, { padded: false, children: [_jsx(CardHeader, { title: "Identification", description: "How this product is recognised across the system" }), _jsxs("div", { className: "grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3", children: [_jsx(Field, { label: "Product name", htmlFor: "name", required: true, error: errors.name, children: _jsx(Input, { id: "name", value: form.name, onChange: update("name"), invalid: Boolean(errors.name), placeholder: "Wireless barcode scanner" }) }), _jsx(Field, { label: "SKU", htmlFor: "sku", required: true, error: errors.sku, hint: "Unique stock keeping unit code", children: _jsx(Input, { id: "sku", value: form.sku, onChange: update("sku"), invalid: Boolean(errors.sku), placeholder: "WBS-001" }) }), _jsx(Field, { label: "Barcode", htmlFor: "barcode", hint: "EAN, UPC or any scanned code", children: _jsx(Input, { id: "barcode", value: form.barcode, onChange: update("barcode"), placeholder: "5901234123457" }) }), _jsx(Field, { label: "Brand", htmlFor: "brand", children: _jsx(Input, { id: "brand", value: form.brand, onChange: update("brand"), placeholder: "Optional" }) }), _jsx(Field, { label: "Unit of measure", htmlFor: "unit", children: _jsx(Select, { id: "unit", value: form.unit, onChange: update("unit"), children: UNITS.map((unit) => _jsx("option", { value: unit, children: unit.toLowerCase() }, unit)) }) }), _jsx(Field, { label: "Status", htmlFor: "status", children: _jsxs(Select, { id: "status", value: form.status, onChange: update("status"), children: [_jsx("option", { value: "ACTIVE", children: "Active" }), _jsx("option", { value: "INACTIVE", children: "Inactive" }), _jsx("option", { value: "DISCONTINUED", children: "Discontinued" }), _jsx("option", { value: "OUT_OF_STOCK", children: "Out of stock" })] }) }), _jsx(Field, { label: "Description", htmlFor: "description", className: "sm:col-span-2 lg:col-span-3", children: _jsx(Textarea, { id: "description", value: form.description, onChange: update("description"), rows: 2, placeholder: "Optional notes about this product" }) })] })] }), _jsxs(Card, { padded: false, children: [_jsx(CardHeader, { title: "Classification", description: "Where this product sits in the catalog" }), _jsxs("div", { className: "grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3", children: [_jsx(Field, { label: "Category", htmlFor: "categoryId", required: true, error: errors.categoryId, children: _jsxs(Select, { id: "categoryId", value: form.categoryId, onChange: update("categoryId"), children: [_jsx("option", { value: "", children: "Select a category" }), categoryOptions.map((category) => _jsx("option", { value: category.id, children: category.name }, category.id))] }) }), _jsx(Field, { label: "Supplier", htmlFor: "supplierId", required: true, error: errors.supplierId, children: _jsxs(Select, { id: "supplierId", value: form.supplierId, onChange: update("supplierId"), children: [_jsx("option", { value: "", children: "Select a supplier" }), activeSuppliers.map((supplier) => _jsx("option", { value: supplier.id, children: supplier.name }, supplier.id))] }) }), _jsx(Field, { label: "Home warehouse", htmlFor: "warehouseId", hint: "Where this product is stocked by default", children: _jsxs(Select, { id: "warehouseId", value: form.warehouseId, onChange: update("warehouseId"), children: [_jsx("option", { value: "", children: "No default warehouse" }), warehouseOptions.map((warehouse) => _jsx("option", { value: warehouse.id, children: warehouse.name }, warehouse.id))] }) })] })] }), _jsxs(Card, { padded: false, children: [_jsx(CardHeader, { title: "Pricing & stock levels", description: "Used to value stock and trigger low-stock alerts" }), _jsxs("div", { className: "grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3", children: [_jsx(Field, { label: "Cost price", htmlFor: "costPrice", required: true, error: errors.costPrice, children: _jsx(Input, { id: "costPrice", type: "number", step: "0.01", min: "0", prefix: "$", value: form.costPrice, onChange: update("costPrice"), invalid: Boolean(errors.costPrice) }) }), _jsx(Field, { label: "Selling price", htmlFor: "sellingPrice", required: true, error: errors.sellingPrice, children: _jsx(Input, { id: "sellingPrice", type: "number", step: "0.01", min: "0", prefix: "$", value: form.sellingPrice, onChange: update("sellingPrice"), invalid: Boolean(errors.sellingPrice) }) }), _jsx("div", { className: "sm:col-span-2 lg:col-span-3", children: _jsxs("p", { className: "text-xs text-slate-500", children: ["Margin per unit:", " ", _jsxs("span", { className: "tabular font-medium text-slate-700", children: ["$", (Number(form.sellingPrice || 0) - Number(form.costPrice || 0)).toFixed(2)] })] }) }), _jsx(Field, { label: "Minimum level", htmlFor: "minStockLevel", error: errors.minStockLevel, children: _jsx(Input, { id: "minStockLevel", type: "number", step: "0.01", min: "0", value: form.minStockLevel, onChange: update("minStockLevel"), invalid: Boolean(errors.minStockLevel) }) }), _jsx(Field, { label: "Reorder level", htmlFor: "reorderLevel", error: errors.reorderLevel, hint: "Triggers the low-stock alert", children: _jsx(Input, { id: "reorderLevel", type: "number", step: "0.01", min: "0", value: form.reorderLevel, onChange: update("reorderLevel"), invalid: Boolean(errors.reorderLevel) }) }), _jsx(Field, { label: "Maximum level", htmlFor: "maxStockLevel", error: errors.maxStockLevel, children: _jsx(Input, { id: "maxStockLevel", type: "number", step: "0.01", min: "0", value: form.maxStockLevel, onChange: update("maxStockLevel"), invalid: Boolean(errors.maxStockLevel), placeholder: "No limit" }) })] })] }), _jsxs(Card, { padded: false, children: [_jsx(CardHeader, { title: "Batch, serial & expiry", description: "Optional traceability and shelf-life tracking" }), _jsxs("div", { className: "grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4", children: [_jsx(Field, { label: "Batch number", htmlFor: "batchNumber", children: _jsx(Input, { id: "batchNumber", value: form.batchNumber, onChange: update("batchNumber"), placeholder: "LOT-2026-01" }) }), _jsx(Field, { label: "Serial number", htmlFor: "serialNumber", children: _jsx(Input, { id: "serialNumber", value: form.serialNumber, onChange: update("serialNumber"), placeholder: "SN-000123" }) }), _jsx(Field, { label: "Manufacturing date", htmlFor: "manufacturingDate", children: _jsx(Input, { id: "manufacturingDate", type: "date", value: form.manufacturingDate, onChange: update("manufacturingDate") }) }), _jsx(Field, { label: "Expiry date", htmlFor: "expiryDate", error: errors.expiryDate, children: _jsx(Input, { id: "expiryDate", type: "date", value: form.expiryDate, onChange: update("expiryDate"), invalid: Boolean(errors.expiryDate) }) })] })] }), _jsxs("div", { className: "flex justify-end gap-2", children: [_jsx(Button, { type: "button", variant: "secondary", onClick: () => navigate("/products"), children: "Cancel" }), _jsx(Button, { type: "submit", icon: _jsx(Save, { className: "h-4 w-4" }), loading: mutation.isPending, children: isEdit ? "Save changes" : "Create product" })] })] });
}
export { ProductFormPage };
