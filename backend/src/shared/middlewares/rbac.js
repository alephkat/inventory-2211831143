/**
 * Role-based access control middleware factory.
 *
 * Usage:
 * requirePermission('manage_users') // requires a single permission
 * requirePermission(['approve_transactions']) // multiple — user needs ANY
 * requireRole('admin') // super-admin style role gate
 *
 * SECURITY is enforced here, on the server, against the
 * permission set loaded from the database (see auth.js). The frontend never
 * decides whether an action is allowed — it only renders UI; the API rejects
 * unauthorized requests with 403.
 */
export const requirePermission = (requirePermission) =>
 (req, res, next) => {
 const user = req.user;
 if (!user) {
 return res.status(401).json({
 success: false,
 message: 'Authentication required',
 code: 401,
 });
 }

 const needed = Array.isArray(required) ? required : [required];
 const has = needed.some((p) => user.permissions?.includes(p));

 if (!has) {
 return res.status(403).json({
 success: false,
 message: 'Insufficient permissions',
 code: 403,
 });
 }

 next();
 };

export const requireRole = (requireRole) =>
 (req, res, next) => {
 const user = req.user;
 if (!user) {
 return res.status(401).json({
 success: false,
 message: 'Authentication required',
 code: 401,
 });
 }
 const allowed = Array.isArray(role) ? role : [role];
 if (!allowed.includes(user.role)) {
 return res.status(403).json({
 success: false,
 message: 'Insufficient role',
 code: 403,
 });
 }
 next();
 };