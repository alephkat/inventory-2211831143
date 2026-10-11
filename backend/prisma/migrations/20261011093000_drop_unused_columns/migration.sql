-- Lean-up for a single local company: drop columns that are never read or
-- written anywhere in the codebase and have no UI to set them.
--
--   User.profileImage          no avatar upload or display exists
--   Product.imageUrl           no image field on the product form
--   Category.imageUrl          no image field on the category form
--   Inventory.lastTransactionId never referenced
--   UserSession.deviceInfo      never referenced
--   UserSession.usedAt          never referenced

ALTER TABLE "User" DROP COLUMN IF EXISTS "profileImage";

ALTER TABLE "Product" DROP COLUMN IF EXISTS "imageUrl";

ALTER TABLE "Category" DROP COLUMN IF EXISTS "imageUrl";

ALTER TABLE "Inventory" DROP COLUMN IF EXISTS "lastTransactionId";

ALTER TABLE "UserSession" DROP COLUMN IF EXISTS "deviceInfo";

ALTER TABLE "UserSession" DROP COLUMN IF EXISTS "usedAt";
