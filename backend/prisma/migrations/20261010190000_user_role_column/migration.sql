-- Single-company simplification: the role becomes a column on "User"
-- instead of a Role/Permission/RolePermission triple. Existing rows keep
-- their effective role because the old role names match the enum values
-- one-for-one (super_admin, admin, inventory_manager, ...).

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('super_admin', 'admin', 'inventory_manager', 'storekeeper', 'procurement_officer', 'sales_officer', 'auditor', 'read_only');

-- AlterTable: add the column with a safe default, then backfill from "Role"
ALTER TABLE "User" ADD COLUMN "role" "UserRole" NOT NULL DEFAULT 'read_only';

-- Backfill guarded so the migration also works on a database that never ran
-- the old role catalogue (nothing to migrate in that case).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'Role') THEN
    UPDATE "User" u
    SET "role" = r."name"::"UserRole"
    FROM "Role" r
    WHERE u."roleId" = r."id";
  END IF;
END $$;

-- DropForeignKey
ALTER TABLE "User" DROP CONSTRAINT IF EXISTS "User_roleId_fkey";

-- DropIndex
DROP INDEX IF EXISTS "RolePermission_roleId_permissionId_key";

-- AlterTable
ALTER TABLE "User" DROP COLUMN "roleId";

-- DropTable
DROP TABLE IF EXISTS "RolePermission";

-- DropTable
DROP TABLE IF EXISTS "Permission";

-- DropTable
DROP TABLE IF EXISTS "Role";
