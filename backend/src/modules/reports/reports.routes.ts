import { Router } from 'express';
import { reportService } from './reports.service';
import { requirePermission } from '../../shared/middlewares/auth';
import { getPagination } from '../../shared/utils/response';

export const reportsRouter = Router();

reportsRouter.get(
  '/valuation',
  requirePermission(['view_reports', 'export_reports']),
  async (req, res, next) => {
    try {
      const pg = getPagination(req.query);
      res.json({
        success: true,
        data: await reportService.inventoryValuation({
          ...pg,
          categoryId: req.query.categoryId as string | undefined,
          warehouseId: req.query.warehouseId as string | undefined,
        }),
      });
    } catch (e) {
      next(e);
    }
  },
);

reportsRouter.get('/movements', requirePermission('view_reports'), async (req, res, next) => {
  try {
    const pg = getPagination(req.query);
    res.json({
      success: true,
      data: await reportService.stockMovements({
        ...pg,
        type: req.query.type as string | undefined,
        startDate: req.query.startDate ? new Date(req.query.startDate as string) : undefined,
        endDate: req.query.endDate ? new Date(req.query.endDate as string) : undefined,
        productId: req.query.productId as string | undefined,
      }),
    });
  } catch (e) {
    next(e);
  }
});

reportsRouter.get('/expiry', requirePermission('view_reports'), async (req, res, next) => {
  try {
    const pg = getPagination(req.query);
    res.json({
      success: true,
      data: await reportService.expiryReport({
        ...pg,
        days: req.query.days ? parseInt(req.query.days as string, 10) : undefined,
        warehouseId: req.query.warehouseId as string | undefined,
        categoryId: req.query.categoryId as string | undefined,
      }),
    });
  } catch (e) {
    next(e);
  }
});

reportsRouter.get('/fast-moving', requirePermission('view_reports'), async (req, res, next) => {
  try {
    res.json({
      success: true,
      data: await reportService.movingProducts({
        days: req.query.days ? parseInt(req.query.days as string, 10) : undefined,
        warehouseId: req.query.warehouseId as string | undefined,
      }),
    });
  } catch (e) {
    next(e);
  }
});

reportsRouter.get(
  '/valuation/export',
  requirePermission('export_reports'),
  async (req, res, next) => {
    try {
      const data = await reportService.inventoryValuation({
        page: 1,
        limit: 10000,
        categoryId: req.query.categoryId as string | undefined,
        warehouseId: req.query.warehouseId as string | undefined,
      });
      const csv = reportService.toCsv(data.items as Record<string, unknown>[]);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="inventory-valuation.csv"');
      res.send(csv);
    } catch (e) {
      next(e);
    }
  },
);
