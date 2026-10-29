import { Router } from "express";
import { requireAuth } from "../auth.js";
import {
  MAX_EXPORT_ROWS, XLSX_TYPE, categoriesFor, exportFileName, parseExportRequest, writeWorkbook,
} from "../exports.js";
import { logExport } from "../exportLog.js";

const router = Router();
router.use(requireAuth);

router.get("/categories", (req, res) => {
  res.json(categoriesFor(req.user.role).map(({ key, name, filters }) => ({ key, name, filters })));
});

router.get("/", async (req, res, next) => {
  const parsed = parseExportRequest(req.query, req.user.role);
  if (parsed.error) return res.status(parsed.status).json({ error: parsed.error });
  const { categories, all, filters } = parsed;
  const log = (recordCount, status) => logExport({ user: req.user, categories, filters, recordCount, status });

  let sheets;
  let total;
  try {
    const counts = await Promise.all(categories.map((c) => c.count(req.user, filters)));
    total = counts.reduce((a, b) => a + b, 0);
    if (total > MAX_EXPORT_ROWS) {
      await log(total, "rejected");
      return res.status(413).json({
        error: `This export has ${total.toLocaleString("en-US")} rows; the limit is ${MAX_EXPORT_ROWS.toLocaleString("en-US")}. Narrow the filters and try again.`,
      });
    }
    // Everything is fetched before the first byte is sent, so errors up to here are still JSON
    sheets = await Promise.all(categories.map(async (category) => ({ category, rows: await category.rows(req.user, filters) })));
    total = sheets.reduce((n, s) => n + s.rows.length, 0);
  } catch (err) {
    return next(err);
  }

  res.setHeader("Content-Type", XLSX_TYPE);
  res.setHeader("Content-Disposition", `attachment; filename="${exportFileName(categories, all, filters.tz)}"`);
  res.setHeader("X-Export-Rows", String(total));
  try {
    await writeWorkbook(res, sheets, filters.tz);
    await log(total, "success");
  } catch (err) {
    // Headers are already sent, so the error can't become JSON; end the broken download
    console.error("Export failed while writing:", err);
    await log(total, "failed");
    res.destroy(err);
  }
});

export default router;
