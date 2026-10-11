import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import { api, normalizeList } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/lib/ToastProvider";
import { errorMessage } from "@/lib/format";
import { Alert, Badge, Button, Card, Field, Input, PageHeader } from "@/components/ui";
import { DataTable, Pagination } from "@/components/DataTable";
import { ConfirmDialog } from "@/components/feedback";
const EMPTY_FORM = {
  name: "",
  code: "",
  contactPerson: "",
  phone: "",
  email: "",
  address: "",
  taxId: "",
  paymentTerms: ""
};
const toNullable = (value) => value.trim() === "" ? null : value.trim();
function CustomersPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { can } = useAuth();
  const canManage = can("manage_customers");
  const searchTimer = useRef();
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [formError, setFormError] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [confirm, setConfirm] = useState(null);
  const customers = useQuery({
    queryKey: ["customers", "list", debouncedSearch, page, limit],
    queryFn: () => api.get("/api/v1/customers", {
      page,
      limit,
      search: debouncedSearch || void 0
    })
  });
  const list = normalizeList(customers.data, limit);
  const save = useMutation({
    mutationFn: (payload) => {
      const body = {
        name: payload.name,
        code: toNullable(payload.code ?? ""),
        contactPerson: toNullable(payload.contactPerson ?? ""),
        phone: toNullable(payload.phone ?? ""),
        email: toNullable(payload.email ?? ""),
        address: toNullable(payload.address ?? ""),
        taxId: toNullable(payload.taxId ?? ""),
        paymentTerms: toNullable(payload.paymentTerms ?? "")
      };
      return editingId ? api.put(`/api/v1/customers/${editingId}`, body) : api.post("/api/v1/customers", body);
    },
    onSuccess: () => {
      toast.success(editingId ? "Customer updated" : "Customer created");
      setEditingId(null);
      setForm(EMPTY_FORM);
      void queryClient.invalidateQueries({ queryKey: ["customers"] });
    },
    onError: (error) => setFormError(errorMessage(error, "Could not save the customer"))
  });
  const remove = useMutation({
    mutationFn: (id) => api.delete(`/api/v1/customers/${id}`),
    onSuccess: () => {
      toast.success("Customer deleted");
      void queryClient.invalidateQueries({ queryKey: ["customers"] });
    },
    onError: (error) => toast.error(error, "Could not delete the customer")
  });
  const scheduleSearch = (value) => {
    setSearch(value);
    window.clearTimeout(searchTimer.current);
    searchTimer.current = window.setTimeout(() => {
      setDebouncedSearch(value);
      setPage(1);
    }, 300);
  };
  const handleSubmit = (event) => {
    event.preventDefault();
    if (!form.name.trim()) {
      setFormError("Customer name is required.");
      return;
    }
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      setFormError("Enter a valid email address.");
      return;
    }
    save.mutate(form);
  };
  const allColumns = [
    {
      key: "name",
      header: "Customer",
      render: (customer) => <div className="min-w-0">
          <p className="truncate font-medium text-slate-900">{customer.name}</p>
          <p className="truncate font-mono text-xs text-slate-500">{customer.code ?? "\u2014"}</p>
        </div>
    },
    {
      key: "contact",
      header: "Contact",
      secondary: true,
      render: (customer) => <div className="min-w-0">
          <p className="truncate text-slate-700">{customer.contactPerson ?? "\u2014"}</p>
          <p className="truncate text-xs text-slate-500">{customer.email ?? customer.phone ?? ""}</p>
        </div>
    },
    {
      key: "terms",
      header: "Payment terms",
      secondary: true,
      render: (customer) => customer.paymentTerms ?? "\u2014"
    },
    {
      key: "status",
      header: "Status",
      secondary: true,
      render: (customer) => <Badge tone={customer.isActive ? "success" : "neutral"}>
          {customer.isActive ? "Active" : "Inactive"}
        </Badge>
    },
    {
      key: "actions",
      header: "",
      headerClassName: "text-right",
      className: "text-right",
      render: (customer) => <div className="flex items-center justify-end gap-1">
          <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          setEditingId(customer.id);
          setForm({
            name: customer.name,
            code: customer.code ?? "",
            contactPerson: customer.contactPerson ?? "",
            phone: customer.phone ?? "",
            email: customer.email ?? "",
            address: customer.address ?? "",
            taxId: customer.taxId ?? "",
            paymentTerms: customer.paymentTerms ?? ""
          });
          setFormError("");
          window.scrollTo({ top: 0, behavior: "smooth" });
        }}
        aria-label={`Edit ${customer.name}`}
      >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
        variant="ghost"
        size="sm"
        className="text-red-600 hover:bg-red-50"
        onClick={() => setConfirm({
          title: "Delete customer",
          message: `Permanently delete "${customer.name}"? Sales orders linked to this customer may become invalid.`,
          confirmLabel: "Delete customer",
          destructive: true,
          onConfirm: async () => {
            await remove.mutateAsync(customer.id);
            setConfirm(null);
          }
        })}
        aria-label={`Delete ${customer.name}`}
      >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
    }
  ];
  const columns = canManage ? allColumns : allColumns.filter((column) => column.key !== "actions");
  return <div className="space-y-5">
      <PageHeader
    title="Customers"
    description={`${list.total} customer${list.total === 1 ? "" : "s"} on record`}
  />

      {canManage && <Card>
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Customer name" htmlFor="customer-name" required>
              <Input
    id="customer-name"
    value={form.name}
    onChange={(event) => setForm({ ...form, name: event.target.value })}
    placeholder="Northwind Traders"
  />
            </Field>
            <Field label="Code" htmlFor="customer-code">
              <Input
    id="customer-code"
    value={form.code}
    onChange={(event) => setForm({ ...form, code: event.target.value })}
    placeholder="CUS-001"
  />
            </Field>
            <Field label="Contact person" htmlFor="customer-contact">
              <Input
    id="customer-contact"
    value={form.contactPerson}
    onChange={(event) => setForm({ ...form, contactPerson: event.target.value })}
    placeholder="John Doe"
  />
            </Field>
            <Field label="Email" htmlFor="customer-email">
              <Input
    id="customer-email"
    type="email"
    value={form.email}
    onChange={(event) => setForm({ ...form, email: event.target.value })}
    placeholder="buying@northwind.com"
  />
            </Field>
            <Field label="Phone" htmlFor="customer-phone">
              <Input
    id="customer-phone"
    value={form.phone}
    onChange={(event) => setForm({ ...form, phone: event.target.value })}
    placeholder="+1 555 0111"
  />
            </Field>
            <Field label="Tax ID" htmlFor="customer-tax">
              <Input
    id="customer-tax"
    value={form.taxId}
    onChange={(event) => setForm({ ...form, taxId: event.target.value })}
    placeholder="Optional"
  />
            </Field>
            <Field label="Payment terms" htmlFor="customer-terms" hint="e.g. Net 30">
              <Input
    id="customer-terms"
    value={form.paymentTerms}
    onChange={(event) => setForm({ ...form, paymentTerms: event.target.value })}
    placeholder="Net 30"
  />
            </Field>
            <Field label="Address" htmlFor="customer-address">
              <Input
    id="customer-address"
    value={form.address}
    onChange={(event) => setForm({ ...form, address: event.target.value })}
    placeholder="Optional"
  />
            </Field>
          </div>

          {formError ? <Alert tone="danger">{formError}</Alert> : null}

          <div className="flex gap-2">
            <Button type="submit" icon={<Plus className="h-4 w-4" />} loading={save.isPending}>
              {editingId ? "Save changes" : "Add customer"}
            </Button>
            {editingId ? <Button
    type="button"
    variant="secondary"
    onClick={() => {
      setEditingId(null);
      setForm(EMPTY_FORM);
      setFormError("");
    }}
  >
                Cancel edit
              </Button> : null}
          </div>
        </form>
      </Card>
      }

      <Card padded={false}>
        <div className="border-b border-slate-200 p-4">
          <Field label="Search">
            <div className="relative max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
    className="pl-9"
    placeholder="Name, code or contact…"
    value={search}
    onChange={(event) => {
      scheduleSearch(event.target.value);
      setPage(1);
    }}
  />
            </div>
          </Field>
        </div>

        <DataTable
    columns={columns}
    rows={list.items}
    rowKey={(customer) => customer.id}
    isLoading={customers.isLoading}
    error={customers.error}
    emptyTitle="No customers found"
    emptyDescription="Add a customer above to start recording sales orders."
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
    isConfirming={remove.isPending}
    error={remove.error}
  />
    </div>;
}
export {
  CustomersPage
};
