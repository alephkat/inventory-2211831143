/**
 * Shared API types. These mirror the Prisma models and the DTOs the services
 * return — `products.service.ts#enrich` and `auth.service.ts#toUserDto` are the
 * two that reshape records rather than passing Prisma rows straight through.
 */

export interface AuthUser {
  id: string;
  username: string;
  email: string;
  fullName: string;
  role: string;
  roleId: string;
  permissions: string[];
  status: string;
  isActive: boolean;
  profileImage: string | null;
  warehouseId: string | null;
  lastLogin: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Tokens {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresAt: string;
}

export type UnitOfMeasurement =
  | 'PIECE'
  | 'KILOGRAM'
  | 'GRAM'
  | 'LITER'
  | 'MILLILITER'
  | 'METER'
  | 'CENTIMETER'
  | 'BOX'
  | 'CARTON'
  | 'PACK'
  | 'DOZEN'
  | 'TON'
  | 'SET'
  | 'BUNDLE';

export const UNITS: UnitOfMeasurement[] = [
  'PIECE', 'KILOGRAM', 'GRAM', 'LITER', 'MILLILITER',
  'METER', 'CENTIMETER', 'BOX', 'CARTON', 'PACK',
  'DOZEN', 'TON', 'SET', 'BUNDLE',
];

export type ProductStatus = 'ACTIVE' | 'INACTIVE' | 'DISCONTINUED' | 'OUT_OF_STOCK';

export interface Category {
  id: string;
  name: string;
  description: string | null;
  parentId: string | null;
  imageUrl: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Supplier {
  id: string;
  name: string;
  code: string | null;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  taxId: string | null;
  paymentTerms: string | null;
  status: 'PENDING_APPROVAL' | 'ACTIVE' | 'INACTIVE' | 'REJECTED' | 'BLACKLISTED';
  isActive: boolean;
  rejectionReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Customer {
  id: string;
  name: string;
  code: string | null;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  taxId: string | null;
  paymentTerms: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Warehouse {
  id: string;
  name: string;
  code: string | null;
  address: string | null;
  contactPerson: string | null;
  phone: string | null;
  managerId: string | null;
  isActive: boolean;
  currentCapacity: number | null;
  maxCapacity: number | null;
  createdAt: string;
  updatedAt: string;
}

/** Product as returned by `products.service.ts#enrich`: base fields + rolled-up stock. */
export interface Product {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  description: string | null;
  categoryId: string;
  category: Category | null;
  brand: string | null;
  unit: UnitOfMeasurement;
  costPrice: number;
  sellingPrice: number;
  minStockLevel: number;
  maxStockLevel: number | null;
  reorderLevel: number;
  supplierId: string;
  supplier: Supplier | null;
  warehouseId: string | null;
  warehouse: Warehouse | null;
  batchNumber: string | null;
  serialNumber: string | null;
  manufacturingDate: string | null;
  expiryDate: string | null;
  imageUrl: string | null;
  status: ProductStatus;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  currentStock: number;
  availableStock: number;
  reservedStock: number;
  stockValue: number;
}

export interface InventoryLevel {
  id: string;
  productId: string;
  warehouseId: string;
  currentQuantity: number;
  availableQuantity: number;
  reservedQuantity: number;
  damagedQuantity: number;
  minQuantity: number | null;
  reorderQuantity: number | null;
  stockValue: number;
  lastUpdated: string;
  product?: Pick<Product, 'name' | 'sku' | 'unit' | 'costPrice' | 'reorderLevel'> | null;
  warehouse?: Warehouse | null;
}

export type TransactionType =
  | 'RECEIVED' | 'ISSUED' | 'RETURNED' | 'TRANSFERRED'
  | 'ADJUSTED' | 'DAMAGED' | 'LOST' | 'EXPIRED';

export type TransactionStatus = 'PENDING' | 'COMPLETED' | 'CANCELLED' | 'APPROVED' | 'REJECTED';

export interface InventoryTransaction {
  id: string;
  productId: string;
  warehouseId: string;
  type: TransactionType;
  status: TransactionStatus;
  quantity: number;
  previousQuantity: number | null;
  newQuantity: number | null;
  referenceNumber: string | null;
  reason: string | null;
  batchNumber: string | null;
  expiryDate: string | null;
  createdAt: string;
  approvedAt: string | null;
  rejectionReason: string | null;
  product?: Pick<Product, 'name' | 'sku' | 'unit'> | null;
  warehouse?: Warehouse | null;
  performedBy?: { id: string; fullName: string } | null;
  approvedBy?: { id: string; fullName: string } | null;
}

export interface UserSummary {
  id: string;
  username: string;
  email: string;
  fullName: string;
  roleId: string;
  status: string;
  isActive: boolean;
  warehouseId: string | null;
  lastLogin: string | null;
  createdAt: string;
  role?: { id: string; name: string } | null;
}

export interface Role {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions?: Array<{ permission: { value: string; name: string } }>;
  _count?: { users: number };
}

export interface AuditLog {
  id: string;
  userId: string;
  userName: string | null;
  action: string;
  resourceType: string;
  resourceId: string;
  oldValues: unknown;
  newValues: unknown;
  ipAddress: string | null;
  createdAt: string;
  user?: { id: string; username: string; fullName: string; role?: { name: string } } | null;
}

export interface Notification {
  id: string;
  userId: string;
  title: string;
  body: string;
  type: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  isRead: boolean;
  createdAt: string;
  readAt: string | null;
}

export interface DashboardStats {
  totalProducts: number;
  totalStockQuantity: number;
  totalStockValue: number;
  lowStockItems: number;
  outOfStockItems: number;
  expiringItems: number;
  pendingPurchaseOrders: number;
  pendingApprovals: number;
  stockReceivedToday: number;
  stockIssuedToday: number;
  recentTransactions: Array<{
    id: string;
    type: TransactionType;
    productName: string | null;
    warehouseName: string | null;
    quantity: number;
    status: TransactionStatus;
    createdAt: string;
  }>;
  lowStockAlerts: Array<{
    productId: string;
    productName: string;
    sku: string;
    currentStock: number;
    reorderLevel: number;
    warehouseName: string;
    deficit: number;
  }>;
  expiringProducts: Array<{
    productId: string;
    productName: string;
    sku: string;
    expiryDate: string | null;
    daysUntilExpiry: number;
    currentStock: number;
    warehouseName: string;
  }>;
}

export interface StockMovementChart {
  labels: string[];
  received: number[];
  issued: number[];
}

export interface InventoryValueChart {
  labels: string[];
  data: Array<{ label: string; value: number }>;
}

export interface ValuationReport {
  items: Array<{
    productId: string;
    productName: string;
    sku: string;
    category: string | null;
    supplier: string | null;
    warehouse: string | null;
    quantity: number;
    costPrice: number;
    stockValue: number;
  }>;
  total: number;
  page: number;
  limit: number;
  summary: { totalValue: number; totalQuantity: number };
}

export interface ExpiryReportItem {
  productId: string;
  name: string;
  sku: string;
  batchNumber: string | null;
  expiryDate: string | null;
  daysUntilExpiry: number | null;
  currentStock: number;
  warehouse: string | null;
  category: string | null;
}

export interface FastMovingItem {
  productId: string;
  productName: string | null;
  sku: string | null;
  quantitySold: number;
  revenue: number;
  currentStock: number;
}

export interface LowStockItem {
  productId: string;
  productName: string;
  sku: string;
  warehouseId: string;
  warehouseName: string;
  currentStock: number;
  reorderLevel: number;
  deficit: number;
}

export type OrderStatus =
  | 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'RECEIVED'
  | 'PARTIALLY_RECEIVED' | 'ISSUED' | 'COMPLETED' | 'CANCELLED';

export interface PurchaseOrderItem {
  id: string;
  productId: string;
  quantity: number;
  receivedQuantity: number;
  unitPrice: number;
  discountPercent: number;
  discountAmount: number;
  taxPercent: number;
  taxAmount: number;
  totalPrice: number;
  product?: Pick<Product, 'name' | 'sku' | 'unit'> | null;
}

export interface PurchaseOrder {
  id: string;
  orderNumber: string;
  supplierId: string;
  warehouseId: string;
  status: OrderStatus;
  subtotal: number;
  taxAmount: number;
  discountAmount: number;
  totalAmount: number;
  currency: string;
  expectedDate: string | null;
  notes: string | null;
  terms: string | null;
  createdAt: string;
  approvedAt: string | null;
  rejectionReason: string | null;
  supplier?: Supplier | null;
  warehouse?: Warehouse | null;
  items?: PurchaseOrderItem[];
}

export interface SalesOrderItem {
  id: string;
  productId: string;
  quantity: number;
  fulfilledQuantity: number;
  unitPrice: number;
  totalPrice: number;
  product?: Pick<Product, 'name' | 'sku' | 'unit'> | null;
}

export interface SalesOrder {
  id: string;
  orderNumber: string;
  customerId: string;
  warehouseId: string;
  status: OrderStatus;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  currency: string;
  expectedDate: string | null;
  createdAt: string;
  approvedAt: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  customer?: Customer | null;
  warehouse?: Warehouse | null;
  items?: SalesOrderItem[];
}