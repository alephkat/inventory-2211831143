import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDownToLine, ArrowUpFromLine, Check, Plus, X } from "lucide-react";
import { api, normalizeList } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/lib/ToastProvider";
import { formatDateTime, formatNumber, humanize } from "@/lib/format";
import {
  Alert,
  Button,
  Card,
  Field,
  Input,
  Modal,
  PageHeader,
  Select,
  Textarea
} from "@/components/ui";
import { DataTable, Pagination } from "@/components/DataTable";
import { StatusBadge } from "@/components/StatusBadge";
const TYPE_OPTIONS = ["RECEIVED", "ISSUED", "RETURNED"];
const STATUS_OPTIONS = ["PENDING", "COMPLETED", "APPROVED", "REJECTED", "CANCELLED"];
const EMPTY_MOVEMENT = {
  productId: "",
  warehouseId: "",
  type: "received",
  quantity: "",
  referenceNumber: "",
  reason: "",
  batchNumber: ""
};
function TransactionsPage() {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_MOVEMENT);
  const [formError, setFormError] = useState("");
  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectReason, setRejectReason] = useState("");
  const transactions = useQuery({
    queryKey: ["transactions", "list", type, status, warehouseId, page, limit],
    queryFn: () => api.get("/api/v1/transactions", {
      page,
      limit,
      type: type || void 0,
      status: status || void 0,
      warehouseId: warehouseId || void 0
    })
  });
  const warehouses = useQuery({
    queryKey: ["warehouses", "all"],
    queryFn: () => api.get("/api/v1/warehouses", { limit: 100 })
  });
  const products = useQuery({
    queryKey: ["products", "options"],
    queryFn: () => api.get("/api/v1/products", { limit: 100, status: "ACTIVE" }),
    enabled: isFormOpen
  });
  const list = normalizeList(transactions.data, limit);
  const warehouseOptions = normalizeList(warehouses.data, 100).items;
  const productOptions = normalizeList(products.data, 100).items;
  const canRecord = can("receive_stock") || can("issue_stock");
  const canApprove = can("approve_transactions");
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["transactions"] });
    void queryClient.invalidateQueries({ queryKey: ["inventory"] });
    void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    void queryClient.invalidateQueries({ queryKey: ["notifications"] });
  };
  const createTransaction = useMutation({
    mutationFn: (payload) => api.post("/api/v1/transactions", {
      productId: payload.productId,
      warehouseId: payload.warehouseId,
      type: payload.type,
      quantity: Number(payload.quantity),
      referenceNumber: payload.referenceNumber || void 0,
      reason: payload.reason || void 0,
      batchNumber: payload.batchNumber || void 0
    }),
    onSuccess: () => {
      toast.success("Movement recorded");
      setIsFormOpen(false);
      setForm(EMPTY_MOVEMENT);
      invalidate();
    },
    onError: (error) => setFormError(error.message || "Could not record the movement")
  });
  const approve = useMutation({
    mutationFn: (id) => api.post(`/api/v1/transactions/${id}/approve`),
    onSuccess: () => {
      toast.success("Transaction approved");
      invalidate();
    },
    onError: (error) => toast.error(error, "Could not approve the transaction")
  });
  const reject = useMutation({
    mutationFn: ({ id, reason }) => api.post(`/api/v1/transactions/${id}/reject`, {
      rejectionReason: reason || void 0
    }),
    onSuccess: () => {
      toast.success("Transaction rejected");
      setRejectTarget(null);
      setRejectReason("");
      invalidate();
    },
    onError: (error) => toast.error(error, "Could not reject the transaction")
  });
  const validateAndSubmit = () => {
    if (!form.productId) {
      setFormError("Choose a product.");
      return;
    }
    if (!form.warehouseId) {
      setFormError("Choose a warehouse.");
      return;
    }
    if (!form.quantity || Number(form.quantity) <= 0) {
      setFormError("Quantity must be greater than zero.");
      return;
    }
    setFormError("");
    createTransaction.mutate(form);
  };
  const handleSubmit = (event) => {
    event.preventDefault();
    validateAndSubmit();
  };
  const columns = [
    {
      key: "date",
      header: "When",
      secondary: true,
      render: (transaction) => <span className="whitespace-nowrap text-xs text-slate-500">
          {formatDateTime(transaction.createdAt)}
        </span>
    },
    {
      key: "product",
      header: "Product",
      render: (transaction) => <div className="min-w-0">
          <p className="truncate font-medium text-slate-900">{transaction.product?.name ?? "\u2014"}</p>
          <p className="truncate font-mono text-xs text-slate-500">
            {transaction.product?.sku ?? "\u2014"}
          </p>
        </div>
    },
    {
      key: "type",
      header: "Movement",
      render: (transaction) => {
        const inbound = transaction.type === "RECEIVED" || transaction.type === "RETURNED";
        return <span
          className={inbound ? "inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700" : "inline-flex items-center gap-1.5 text-sm font-medium text-amber-700"}
        >
            {inbound ? <ArrowDownToLine className="h-3.5 w-3.5" /> : <ArrowUpFromLine className="h-3.5 w-3.5" />}
            {humanize(transaction.type)}
          </span>;
      }
    },
    {
      key: "quantity",
      header: "Quantity",
      render: (transaction) => <span className="tabular font-semibold text-slate-900">
          {formatNumber(transaction.quantity)}
        </span>
    },
    {
      key: "warehouse",
      header: "Warehouse",
      secondary: true,
      render: (transaction) => transaction.warehouse?.name ?? "\u2014"
    },
    {
      key: "performedBy",
      header: "By",
      secondary: true,
      render: (transaction) => transaction.performedBy?.fullName ?? "\u2014"
    },
    {
      key: "status",
      header: "Status",
      render: (transaction) => <StatusBadge status={transaction.status} />
    },
    {
      key: "actions",
      header: "",
      headerClassName: "text-right",
      className: "text-right",
      render: (transaction) => canApprove && transaction.status === "PENDING" ? <div className="flex items-center justify-end gap-1">
            <Button
        variant="ghost"
        size="sm"
        className="text-emerald-600 hover:bg-emerald-50"
        onClick={() => approve.mutate(transaction.id)}
        disabled={approve.isPending}
        aria-label="Approve transaction"
      >
              <Check className="h-3.5 w-3.5" />
            </Button>
            <Button
        variant="ghost"
        size="sm"
        className="text-red-600 hover:bg-red-50"
        onClick={() => setRejectTarget(transaction)}
        aria-label="Reject transaction"
      >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div> : null
    }
  ];
  return <div className="space-y-5">
      <PageHeader
    title="Transactions"
    description="Every stock movement, with its approval state"
    actions={canRecord ? <Button icon={<Plus className="h-4 w-4" />} onClick={() => setIsFormOpen(true)}>
              Record movement
            </Button> : null}
  />

      {!canApprove ? <Alert tone="info">
          Movements you record are submitted for approval. Someone with the “Approve Transactions”
          permission will apply them to stock levels.
        </Alert> : null}

      <Card padded={false}>
        <div className="grid gap-3 border-b border-slate-200 p-4 sm:grid-cols-3">
          <Field label="Movement type">
            <Select
    value={type}
    onChange={(event) => {
      setType(event.target.value);
      setPage(1);
    }}
  >
              <option value="">All types</option>
              {TYPE_OPTIONS.map((option) => <option key={option} value={option}>
                  {humanize(option)}
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
                  {humanize(option)}
                </option>)}
            </Select>
          </Field>
          <Field label="Warehouse">
            <Select
    value={warehouseId}
    onChange={(event) => {
      setWarehouseId(event.target.value);
      setPage(1);
    }}
  >
              <option value="">All warehouses</option>
              {warehouseOptions.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>
                  {warehouse.name}
                </option>)}
            </Select>
          </Field>
        </div>

        <DataTable
    columns={columns}
    rows={list.items}
    rowKey={(transaction) => transaction.id}
    isLoading={transactions.isLoading}
    error={transactions.error}
    emptyTitle="No transactions found"
    emptyDescription="Record a movement to see it appear here."
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
    /* ------------------------------------------------- Record movement */
  }
      <Modal
    open={isFormOpen}
    onClose={() => setIsFormOpen(false)}
    title="Record a stock movement"
    description="Book stock in or out of a warehouse."
    footer={<>
            <Button variant="secondary" onClick={() => setIsFormOpen(false)}>
              Cancel
            </Button>
            <Button onClick={validateAndSubmit} loading={createTransaction.isPending}>
              Record movement
            </Button>
          </>}
  >
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Movement type" htmlFor="tx-type" required>
            <Select
    id="tx-type"
    value={form.type}
    onChange={(event) => setForm({ ...form, type: event.target.value })}
  >
              <option value="received">Received — stock coming in</option>
              <option value="issued">Issued — stock going out</option>
              <option value="returned">Returned — customer return</option>
            </Select>
          </Field>

          <Field label="Product" htmlFor="tx-product" required>
            <Select
    id="tx-product"
    value={form.productId}
    onChange={(event) => setForm({ ...form, productId: event.target.value })}
  >
              <option value="">Select a product</option>
              {productOptions.map((product) => <option key={product.id} value={product.id}>
                  {product.name} ({product.sku})
                </option>)}
            </Select>
          </Field>

          <Field label="Warehouse" htmlFor="tx-warehouse" required>
            <Select
    id="tx-warehouse"
    value={form.warehouseId}
    onChange={(event) => setForm({ ...form, warehouseId: event.target.value })}
  >
              <option value="">Select a warehouse</option>
              {warehouseOptions.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>
                  {warehouse.name}
                </option>)}
            </Select>
          </Field>

          <Field label="Quantity" htmlFor="tx-quantity" required>
            <Input
    id="tx-quantity"
    type="number"
    step="0.01"
    min="0.01"
    value={form.quantity}
    onChange={(event) => setForm({ ...form, quantity: event.target.value })}
    placeholder="0"
  />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Reference number" htmlFor="tx-reference">
              <Input
    id="tx-reference"
    value={form.referenceNumber}
    onChange={(event) => setForm({ ...form, referenceNumber: event.target.value })}
    placeholder="Optional"
  />
            </Field>
            <Field label="Batch number" htmlFor="tx-batch">
              <Input
    id="tx-batch"
    value={form.batchNumber}
    onChange={(event) => setForm({ ...form, batchNumber: event.target.value })}
    placeholder="Optional"
  />
            </Field>
          </div>

          <Field label="Reason" htmlFor="tx-reason">
            <Textarea
    id="tx-reason"
    rows={2}
    value={form.reason}
    onChange={(event) => setForm({ ...form, reason: event.target.value })}
    placeholder="Why is this movement happening?"
  />
          </Field>

          {formError ? <Alert tone="danger">{formError}</Alert> : null}
        </form>
      </Modal>

      {
    /* ------------------------------------------------------- Reject */
  }
      <Modal
    open={rejectTarget !== null}
    onClose={() => {
      setRejectTarget(null);
      setRejectReason("");
    }}
    title="Reject transaction"
    description="The movement will not be applied to stock levels."
    size="sm"
    footer={<>
            <Button
      variant="secondary"
      onClick={() => {
        setRejectTarget(null);
        setRejectReason("");
      }}
      disabled={reject.isPending}
    >
              Cancel
            </Button>
            <Button
      variant="danger"
      onClick={() => rejectTarget && reject.mutate({ id: rejectTarget.id, reason: rejectReason })}
      loading={reject.isPending}
    >
              Reject transaction
            </Button>
          </>}
  >
        <Field label="Reason" htmlFor="reject-reason" hint="Stored on the transaction for the record">
          <Textarea
    id="reject-reason"
    rows={3}
    value={rejectReason}
    onChange={(event) => setRejectReason(event.target.value)}
    placeholder="Optional"
  />
        </Field>
        {reject.error ? <div className="mt-3">
            <Alert tone="danger">{reject.error.message}</Alert>
          </div> : null}
      </Modal>
    </div>;
}
export {
  TransactionsPage
};
