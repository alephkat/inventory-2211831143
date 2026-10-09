import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import { api, normalizeList } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/lib/ToastProvider";
import { formatCurrency, formatNumber } from "@/lib/format";
import { Badge, Button, Card, Field, Input, PageHeader, Select } from "@/components/ui";
import { DataTable, Pagination } from "@/components/DataTable";
import { ConfirmDialog } from "@/components/feedback";
import { StatusBadge } from "@/components/StatusBadge";
const STATUS_OPTIONS = ["ACTIVE", "INACTIVE", "DISCONTINUED", "OUT_OF_STOCK"];
function stockTone(product) {
  if (product.currentStock <= 0) return { tone: "danger", label: "Out of stock" };
  const threshold = product.reorderLevel > 0 ? product.reorderLevel : product.minStockLevel;
  if (threshold > 0 && product.currentStock <= threshold) {
    return { tone: "warning", label: "Low" };
  }
  return { tone: "success", label: "In stock" };
}
function ProductsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { can } = useAuth();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [confirm, setConfirm] = useState(null);
  const searchTimer = useRef();
  const scheduleSearch = (value) => {
    setSearch(value);
    window.clearTimeout(searchTimer.current);
    searchTimer.current = window.setTimeout(() => {
      setDebouncedSearch(value);
      setPage(1);
    }, 300);
  };
  const products = useQuery({
    queryKey: ["products", "list", debouncedSearch, categoryId, status, page, limit],
    queryFn: () => api.get("/api/v1/products", {
      page,
      limit,
      search: debouncedSearch || void 0,
      categoryId: categoryId || void 0,
      status: status || void 0
    })
  });
  const categories = useQuery({
    queryKey: ["categories", "all"],
    queryFn: () => api.get("/api/v1/categories")
  });
  const list = normalizeList(products.data, limit);
  const deleteProduct = useMutation({
    mutationFn: (id) => api.delete(`/api/v1/products/${id}`),
    onSuccess: () => {
      toast.success("Product deleted");
      void queryClient.invalidateQueries({ queryKey: ["products"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (error) => toast.error(error, "Could not delete the product")
  });
  const requestDelete = (product) => {
    setConfirm({
      title: "Delete product",
      message: `Permanently delete "${product.name}" (${product.sku})? This cannot be undone.`,
      confirmLabel: "Delete product",
      destructive: true,
      onConfirm: async () => {
        await deleteProduct.mutateAsync(product.id);
        setConfirm(null);
      }
    });
  };
  const columns = [
    {
      key: "name",
      header: "Product",
      render: (product) => <div className="min-w-0">
          <p className="truncate font-medium text-slate-900">{product.name}</p>
          <p className="truncate font-mono text-xs text-slate-500">{product.sku}</p>
        </div>
    },
    {
      key: "category",
      header: "Category",
      secondary: true,
      render: (product) => product.category?.name ?? "\u2014"
    },
    {
      key: "stock",
      header: "In stock",
      render: (product) => {
        const health = stockTone(product);
        return <div>
            <p className="tabular font-medium text-slate-900">
              {formatNumber(product.currentStock)}{" "}
              <span className="text-xs font-normal text-slate-500">{product.unit.toLowerCase()}</span>
            </p>
            <Badge tone={health.tone} className="mt-0.5">
              {health.label}
            </Badge>
          </div>;
      }
    },
    {
      key: "prices",
      header: "Prices",
      secondary: true,
      render: (product) => <div className="tabular whitespace-nowrap">
          <p className="font-medium text-slate-900">{formatCurrency(product.sellingPrice)}</p>
          <p className="text-xs text-slate-500">cost {formatCurrency(product.costPrice)}</p>
        </div>
    },
    {
      key: "value",
      header: "Stock value",
      secondary: true,
      render: (product) => <span className="tabular font-medium text-slate-700">
          {formatCurrency(product.stockValue)}
        </span>
    },
    {
      key: "status",
      header: "Status",
      secondary: true,
      render: (product) => <StatusBadge status={product.status} />
    },
    {
      key: "actions",
      header: "",
      headerClassName: "text-right",
      className: "text-right",
      render: (product) => <div className="flex items-center justify-end gap-1">
          {can("edit_product") ? <Button
        variant="ghost"
        size="sm"
        onClick={(event) => {
          event.stopPropagation();
          navigate(`/products/${product.id}/edit`);
        }}
        aria-label={`Edit ${product.name}`}
      >
              <Pencil className="h-3.5 w-3.5" />
            </Button> : null}
          {can("delete_product") ? <Button
        variant="ghost"
        size="sm"
        className="text-red-600 hover:bg-red-50"
        onClick={(event) => {
          event.stopPropagation();
          requestDelete(product);
        }}
        aria-label={`Delete ${product.name}`}
      >
              <Trash2 className="h-3.5 w-3.5" />
            </Button> : null}
        </div>
    }
  ];
  const categoryOptions = normalizeList(categories.data).items;
  return <div className="space-y-5">
      <PageHeader
    title="Products"
    description={`${list.total} product${list.total === 1 ? "" : "s"} in the catalog`}
    actions={can("add_product") ? <Button icon={<Plus className="h-4 w-4" />} onClick={() => navigate("/products/new")}>
              New product
            </Button> : null}
  />

      <Card padded={false}>
        {
    /* -------------------------------------------------------- Filters */
  }
        <div className="grid gap-3 border-b border-slate-200 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Search" className="sm:col-span-2 lg:col-span-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
    className="pl-9"
    placeholder="Name, SKU or barcode…"
    value={search}
    onChange={(event) => {
      scheduleSearch(event.target.value);
      setPage(1);
    }}
  />
            </div>
          </Field>

          <Field label="Category">
            <Select
    value={categoryId}
    onChange={(event) => {
      setCategoryId(event.target.value);
      setPage(1);
    }}
  >
              <option value="">All categories</option>
              {categoryOptions.map((category) => <option key={category.id} value={category.id}>
                  {category.name}
                </option>)}
            </Select>
          </Field>

          <Field label="Status">
            <Select
    value={status}
    onChange={(event) => {
      setStatus(event.target.value);
      setPage(1);
    }}
  >
              <option value="">All statuses</option>
              {STATUS_OPTIONS.map((option) => <option key={option} value={option}>
                  {option.replace(/_/g, " ").toLowerCase()}
                </option>)}
            </Select>
          </Field>
        </div>

        <DataTable
    columns={columns}
    rows={list.items}
    rowKey={(product) => product.id}
    isLoading={products.isLoading}
    error={products.error}
    emptyTitle="No products found"
    emptyDescription={debouncedSearch || categoryId || status ? "Try adjusting your filters." : "Add your first product to start tracking inventory."}
    emptyAction={can("add_product") ? <Button icon={<Plus className="h-4 w-4" />} onClick={() => navigate("/products/new")}>
                New product
              </Button> : null}
  />

        {list.total > 0 ? <Pagination
    page={page}
    limit={limit}
    total={list.total}
    onPageChange={setPage}
    onLimitChange={(value) => {
      setLimit(value);
      setPage(1);
    }}
  /> : null}
      </Card>

      <ConfirmDialog
    open={confirm !== null}
    onClose={() => setConfirm(null)}
    title={confirm?.title ?? ""}
    message={confirm?.message ?? ""}
    confirmLabel={confirm?.confirmLabel}
    destructive={confirm?.destructive}
    onConfirm={confirm?.onConfirm ?? (() => void 0)}
    isConfirming={deleteProduct.isPending}
    error={deleteProduct.error}
  />

      <p className="text-xs text-slate-400">
        Tip: products are stocked per warehouse. See{" "}
        <Link to="/inventory" className="text-brand-600 hover:underline">
          Stock levels
        </Link>{" "}
        to see quantities on hand.
      </p>
    </div>;
}
export {
  ProductsPage
};
