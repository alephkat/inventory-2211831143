import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, PackageMinus, Plus, Send, Trash2, Truck } from "lucide-react";
import { api, normalizeList } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/lib/ToastProvider";
import { formatCurrency, formatDate, formatNumber, humanize } from "@/lib/format";
import {
  Alert,
  Button,
  Card,
  Field,
  Input,
  Modal,
  PageHeader,
  Select
} from "@/components/ui";
import { DataTable, Pagination } from "@/components/DataTable";
import { StatusBadge } from "@/components/StatusBadge";
const STATUS_OPTIONS = [
  "DRAFT",
  "PENDING",
  "APPROVED",
  "REJECTED",
  "ISSUED",
  "COMPLETED",
  "CANCELLED"
];
const EMPTY_LINE = { productId: "", quantity: "1", unitPrice: "0" };
const lineTotal = (line) => (Number(line.quantity) || 0) * (Number(line.unitPrice) || 0);
function SalesOrdersPage() {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [status, setStatus] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    customerId: "",
    warehouseId: "",
    expectedDate: ""
  });
  const [lines, setLines] = useState([{ ...EMPTY_LINE }]);
  const [createError, setCreateError] = useState("");
  const [detailId, setDetailId] = useState(null);
  const [issueTarget, setIssueTarget] = useState(null);
  const [issueLines, setIssueLines] = useState({});
  const orders = useQuery({
    queryKey: ["sales-orders", "list", status, page, limit],
    queryFn: () => api.get("/api/v1/sales-orders", { page, limit, status: status || void 0 })
  });
  const customers = useQuery({
    queryKey: ["customers", "all"],
    queryFn: () => api.get("/api/v1/customers", { limit: 100 }),
    enabled: isCreateOpen
  });
  const warehouses = useQuery({
    queryKey: ["warehouses", "all"],
    queryFn: () => api.get("/api/v1/warehouses", { limit: 100 })
  });
  const products = useQuery({
    queryKey: ["products", "options"],
    queryFn: () => api.get("/api/v1/products", { limit: 100, status: "ACTIVE" }),
    enabled: isCreateOpen
  });
  const detail = useQuery({
    queryKey: ["sales-orders", "detail", detailId],
    queryFn: () => api.get(`/api/v1/sales-orders/${detailId}`),
    enabled: detailId !== null
  });
  const list = normalizeList(orders.data, limit);
  const customerOptions = normalizeList(customers.data, 100).items;
  const warehouseOptions = normalizeList(warehouses.data, 100).items;
  const productOptions = normalizeList(products.data, 100).items;
  const canManage = can("manage_sales_orders");
  const canApprove = can("approve_transactions");
  const canIssue = can("issue_stock");
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["sales-orders"] });
    void queryClient.invalidateQueries({ queryKey: ["inventory"] });
    void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    void queryClient.invalidateQueries({ queryKey: ["notifications"] });
  };
  const runAction = useMutation({
    mutationFn: ({ id, action }) => api.post(`/api/v1/sales-orders/${id}/${action}`),
    onSuccess: (_data, variables) => {
      toast.success(`Sales order ${variables.action}ed`);
      invalidate();
    },
    onError: (error) => toast.error(error, "Could not complete that action")
  });
  const issueStock = useMutation({
    mutationFn: () => api.post(`/api/v1/sales-orders/${issueTarget.id}/issue`, {
      items: Object.entries(issueLines).map(([itemId, quantity]) => ({ itemId, quantity: Number(quantity) || 0 })).filter((item) => item.quantity > 0)
    }),
    onSuccess: () => {
      toast.success("Stock issued");
      setIssueTarget(null);
      setIssueLines({});
      invalidate();
    },
    onError: (error) => toast.error(error, "Could not issue this stock")
  });
  const createOrder = useMutation({
    mutationFn: () => api.post("/api/v1/sales-orders", {
      customerId: createForm.customerId,
      warehouseId: createForm.warehouseId,
      expectedDate: createForm.expectedDate || void 0,
      items: lines.filter((line) => line.productId).map((line) => ({
        productId: line.productId,
        quantity: Number(line.quantity),
        unitPrice: Number(line.unitPrice)
      }))
    }),
    onSuccess: () => {
      toast.success("Sales order created as a draft");
      setIsCreateOpen(false);
      setCreateForm({ customerId: "", warehouseId: "", expectedDate: "" });
      setLines([{ ...EMPTY_LINE }]);
      invalidate();
    },
    onError: (error) => setCreateError(error.message || "Could not create the sales order")
  });
  const orderTotal = useMemo(
    () => lines.reduce((sum, line) => sum + (line.productId ? lineTotal(line) : 0), 0),
    [lines]
  );
  const submitCreate = () => {
    const validLines = lines.filter((line) => line.productId);
    if (!createForm.customerId) {
      setCreateError("Choose a customer.");
      return;
    }
    if (!createForm.warehouseId) {
      setCreateError("Choose a warehouse.");
      return;
    }
    if (validLines.length === 0) {
      setCreateError("Add at least one product line.");
      return;
    }
    if (validLines.some((line) => Number(line.quantity) <= 0 || Number(line.unitPrice) < 0)) {
      setCreateError("Every line needs a quantity above zero and a valid unit price.");
      return;
    }
    setCreateError("");
    createOrder.mutate();
  };
  const updateLine = (index, patch) => {
    setLines((current) => current.map((line, i) => i === index ? { ...line, ...patch } : line));
  };
  const columns = [
    {
      key: "number",
      header: "Order",
      render: (order) => <div className="min-w-0">
          <p className="truncate font-mono text-sm font-medium text-slate-900">{order.orderNumber}</p>
          <p className="truncate text-xs text-slate-500">{order.customer?.name ?? "\u2014"}</p>
        </div>
    },
    {
      key: "warehouse",
      header: "Warehouse",
      secondary: true,
      render: (order) => order.warehouse?.name ?? "\u2014"
    },
    {
      key: "expected",
      header: "Expected",
      secondary: true,
      render: (order) => formatDate(order.expectedDate)
    },
    {
      key: "total",
      header: "Total",
      render: (order) => <span className="tabular font-semibold text-slate-900">
          {formatCurrency(order.totalAmount)}
        </span>
    },
    {
      key: "status",
      header: "Status",
      render: (order) => <StatusBadge status={order.status} />
    },
    {
      key: "actions",
      header: "Actions",
      headerClassName: "text-right",
      className: "text-right",
      render: (order) => <div className="flex flex-wrap items-center justify-end gap-1">
          <Button variant="ghost" size="sm" onClick={() => setDetailId(order.id)}>
            View
          </Button>

          {canApprove && order.status === "DRAFT" ? <Button
        variant="ghost"
        size="sm"
        onClick={() => runAction.mutate({ id: order.id, action: "submit" })}
        disabled={runAction.isPending}
      >
              <Send className="h-3.5 w-3.5" />
              Submit
            </Button> : null}

          {canApprove && order.status === "PENDING" ? <Button
        variant="ghost"
        size="sm"
        className="text-emerald-600 hover:bg-emerald-50"
        onClick={() => runAction.mutate({ id: order.id, action: "approve" })}
        disabled={runAction.isPending}
      >
              <Check className="h-3.5 w-3.5" />
              Approve
            </Button> : null}

          {canIssue && order.status === "APPROVED" ? <Button
        variant="ghost"
        size="sm"
        className="text-brand-600 hover:bg-brand-50"
        onClick={() => {
          setIssueTarget(order);
          setIssueLines({});
        }}
      >
              <PackageMinus className="h-3.5 w-3.5" />
              Issue
            </Button> : null}

          {canManage && (order.status === "ISSUED" || order.status === "APPROVED") ? <Button
        variant="ghost"
        size="sm"
        onClick={() => runAction.mutate({ id: order.id, action: "deliver" })}
        disabled={runAction.isPending}
      >
              <Truck className="h-3.5 w-3.5" />
              Deliver
            </Button> : null}

          {canManage && !["COMPLETED", "CANCELLED"].includes(order.status) ? <Button
        variant="ghost"
        size="sm"
        className="text-red-600 hover:bg-red-50"
        onClick={() => runAction.mutate({ id: order.id, action: "cancel" })}
        disabled={runAction.isPending}
      >
              Cancel
            </Button> : null}
        </div>
    }
  ];
  const detailItems = detail.data?.items ?? [];
  return <div className="space-y-5">
      <PageHeader
    title="Sales orders"
    description={`${list.total} order${list.total === 1 ? "" : "s"} on record`}
    actions={canManage ? <Button icon={<Plus className="h-4 w-4" />} onClick={() => setIsCreateOpen(true)}>
              New sales order
            </Button> : null}
  />

      <Card padded={false}>
        <div className="border-b border-slate-200 p-4">
          <Field label="Status" className="max-w-xs">
            <Select
    value={status}
    onChange={(event) => {
      setStatus(event.target.value);
      setPage(1);
    }}
  >
              <option value="">All statuses</option>
              {STATUS_OPTIONS.map((option) => <option key={option} value={option}>
                  {humanize(option)}
                </option>)}
            </Select>
          </Field>
        </div>

        <DataTable
    columns={columns}
    rows={list.items}
    rowKey={(order) => order.id}
    isLoading={orders.isLoading}
    error={orders.error}
    emptyTitle="No sales orders"
    emptyDescription="Create an order to record stock leaving for a customer."
    emptyAction={canManage ? <Button icon={<Plus className="h-4 w-4" />} onClick={() => setIsCreateOpen(true)}>
                New sales order
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

      {
    /* ------------------------------------------------------- Create */
  }
      <Modal
    open={isCreateOpen}
    onClose={() => setIsCreateOpen(false)}
    title="New sales order"
    description="Orders start as a draft. Submit them for approval when ready."
    size="lg"
    footer={<>
            <Button variant="secondary" onClick={() => setIsCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submitCreate} loading={createOrder.isPending}>
              Create draft
            </Button>
          </>}
  >
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Customer" htmlFor="so-customer" required>
              <Select
    id="so-customer"
    value={createForm.customerId}
    onChange={(event) => setCreateForm({ ...createForm, customerId: event.target.value })}
  >
                <option value="">Select a customer</option>
                {customerOptions.map((customer) => <option key={customer.id} value={customer.id}>
                    {customer.name}
                  </option>)}
              </Select>
            </Field>
            <Field label="Warehouse" htmlFor="so-warehouse" required>
              <Select
    id="so-warehouse"
    value={createForm.warehouseId}
    onChange={(event) => setCreateForm({ ...createForm, warehouseId: event.target.value })}
  >
                <option value="">Select a warehouse</option>
                {warehouseOptions.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>
                    {warehouse.name}
                  </option>)}
              </Select>
            </Field>
            <Field label="Expected date" htmlFor="so-expected">
              <Input
    id="so-expected"
    type="date"
    value={createForm.expectedDate}
    onChange={(event) => setCreateForm({ ...createForm, expectedDate: event.target.value })}
  />
            </Field>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-medium text-slate-700">Order lines</p>
              <Button
    variant="secondary"
    size="sm"
    icon={<Plus className="h-3.5 w-3.5" />}
    onClick={() => setLines((current) => [...current, { ...EMPTY_LINE }])}
  >
                Add line
              </Button>
            </div>

            <div className="space-y-2">
              {lines.map((line, index) => <div
    key={index}
    className="grid gap-2 rounded-lg border border-slate-200 p-3 sm:grid-cols-12 sm:items-end"
  >
                  <Field label="Product" className="sm:col-span-5" htmlFor={`so-line-product-${index}`}>
                    <Select
    id={`so-line-product-${index}`}
    value={line.productId}
    onChange={(event) => {
      const product = productOptions.find((p) => p.id === event.target.value);
      updateLine(index, {
        productId: event.target.value,
        // Default to the product's selling price.
        unitPrice: product ? String(product.sellingPrice) : line.unitPrice
      });
    }}
  >
                      <option value="">Select a product</option>
                      {productOptions.map((product) => <option key={product.id} value={product.id}>
                          {product.name} ({product.sku})
                        </option>)}
                    </Select>
                  </Field>
                  <Field label="Qty" className="sm:col-span-2" htmlFor={`so-line-qty-${index}`}>
                    <Input
    id={`so-line-qty-${index}`}
    type="number"
    step="0.01"
    min="0"
    value={line.quantity}
    onChange={(event) => updateLine(index, { quantity: event.target.value })}
  />
                  </Field>
                  <Field label="Unit price" className="sm:col-span-2" htmlFor={`so-line-price-${index}`}>
                    <Input
    id={`so-line-price-${index}`}
    type="number"
    step="0.01"
    min="0"
    prefix="$"
    value={line.unitPrice}
    onChange={(event) => updateLine(index, { unitPrice: event.target.value })}
  />
                  </Field>
                  <div className="flex items-center justify-between gap-2 sm:col-span-3">
                    <span className="tabular text-sm font-semibold text-slate-900">
                      {formatCurrency(lineTotal(line))}
                    </span>
                    <Button
    variant="ghost"
    size="sm"
    className="text-red-600 hover:bg-red-50"
    disabled={lines.length === 1}
    onClick={() => setLines((current) => current.filter((_, i) => i !== index))}
    aria-label={`Remove line ${index + 1}`}
  >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>)}
            </div>

            <div className="mt-3 flex justify-end border-t border-slate-200 pt-3">
              <p className="text-sm text-slate-600">
                Order total:{" "}
                <span className="tabular text-base font-semibold text-slate-900">
                  {formatCurrency(orderTotal)}
                </span>
              </p>
            </div>
          </div>

          {createError ? <Alert tone="danger">{createError}</Alert> : null}
        </div>
      </Modal>

      {
    /* ------------------------------------------------------- Detail */
  }
      <Modal
    open={detailId !== null}
    onClose={() => setDetailId(null)}
    title={detail.data?.orderNumber ?? "Sales order"}
    description={detail.data ? `${detail.data.customer?.name ?? "Customer"} \xB7 ${detail.data.warehouse?.name ?? ""}` : void 0}
    size="lg"
    footer={<Button variant="secondary" onClick={() => setDetailId(null)}>
            Close
          </Button>}
  >
        {!detail.data ? <p className="py-8 text-center text-sm text-slate-500">Loading…</p> : <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <StatusBadge status={detail.data.status} />
              <span className="tabular text-sm font-semibold text-slate-900">
                {formatCurrency(detail.data.totalAmount)}
              </span>
              {detail.data.expectedDate ? <span className="text-xs text-slate-500">
                  Expected {formatDate(detail.data.expectedDate)}
                </span> : null}
              {detail.data.shippedAt ? <span className="text-xs text-slate-500">
                  Shipped {formatDate(detail.data.shippedAt)}
                </span> : null}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-slate-200 bg-slate-50">
                  <tr>
                    <th className="th">Product</th>
                    <th className="th text-right">Ordered</th>
                    <th className="th text-right">Issued</th>
                    <th className="th text-right">Unit price</th>
                    <th className="th text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {detailItems.map((item) => <tr key={item.id}>
                      <td className="td">
                        <p className="font-medium text-slate-900">{item.product?.name}</p>
                        <p className="font-mono text-xs text-slate-500">{item.product?.sku}</p>
                      </td>
                      <td className="td tabular text-right">{formatNumber(item.quantity)}</td>
                      <td className="td tabular text-right">{formatNumber(item.fulfilledQuantity)}</td>
                      <td className="td tabular text-right">{formatCurrency(item.unitPrice)}</td>
                      <td className="td tabular text-right font-medium">
                        {formatCurrency(item.totalPrice)}
                      </td>
                    </tr>)}
                </tbody>
              </table>
            </div>
          </div>}
      </Modal>

      {
    /* -------------------------------------------------------- Issue */
  }
      <Modal
    open={issueTarget !== null}
    onClose={() => {
      setIssueTarget(null);
      setIssueLines({});
    }}
    title={`Issue ${issueTarget?.orderNumber ?? "stock"}`}
    description="Enter what is physically leaving the warehouse."
    size="lg"
    footer={<>
            <Button
      variant="secondary"
      onClick={() => {
        setIssueTarget(null);
        setIssueLines({});
      }}
      disabled={issueStock.isPending}
    >
              Cancel
            </Button>
            <Button
      onClick={() => {
        if (issueTarget) issueStock.mutate();
      }}
      loading={issueStock.isPending}
      disabled={!Object.values(issueLines).some((quantity) => Number(quantity) > 0)}
    >
              Confirm issue
            </Button>
          </>}
  >
        <div className="space-y-3">
          {(issueTarget?.items ?? []).map((item) => {
    const outstanding = item.quantity - item.fulfilledQuantity;
    if (outstanding <= 0) return null;
    return <div key={item.id} className="rounded-lg border border-slate-200 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-slate-900">{item.product?.name}</p>
                  <p className="tabular shrink-0 text-xs text-slate-500">
                    {formatNumber(item.fulfilledQuantity)} of {formatNumber(item.quantity)} issued
                  </p>
                </div>
                <Field label="Issuing now" htmlFor={`issue-qty-${item.id}`}>
                  <Input
      id={`issue-qty-${item.id}`}
      type="number"
      step="0.01"
      min="0"
      max={outstanding}
      value={issueLines[item.id] ?? ""}
      onChange={(event) => setIssueLines((current) => ({ ...current, [item.id]: event.target.value }))}
      placeholder="0"
    />
                </Field>
              </div>;
  })}
          {issueStock.error ? <Alert tone="danger">{issueStock.error.message}</Alert> : null}
        </div>
      </Modal>
    </div>;
}
export {
  SalesOrdersPage
};
