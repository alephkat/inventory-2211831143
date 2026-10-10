-- Single-company simplification: drop TransferHistory.
--
-- Every status transition is already recorded by the generic audit log
-- (createAuditLog on approve/dispatch/confirm/reject/cancel), and nothing in
-- the API or frontend read this table, so it was pure duplication.

-- DropTable
DROP TABLE IF EXISTS "TransferHistory";
