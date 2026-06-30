import PDFDocument from "pdfkit";
import { Response } from "express";

export type Column = { header: string; key: string; width: number; align?: "left" | "right" };

export function streamReport(
  res: Response,
  opts: { filename: string; title: string; subtitle?: string; columns: Column[]; rows: Record<string, any>[] }
) {
  const doc = new PDFDocument({ size: "A4", margin: 40 });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${opts.filename}"`);
  doc.pipe(res);

  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const contentW = right - left;
  const totalW = opts.columns.reduce((s, c) => s + c.width, 0);
  const cols = opts.columns.map((c) => ({ ...c, w: (c.width / totalW) * contentW }));

  // header
  doc.fontSize(18).fillColor("#171c28").text("Apophis Solutions");
  doc.fontSize(12).fillColor("#3b5bdb").text(opts.title);
  if (opts.subtitle) doc.fontSize(9).fillColor("#8b96a8").text(opts.subtitle);
  doc.fontSize(8).fillColor("#8b96a8").text(`Generated ${new Date().toLocaleString("en-IN")}`);
  doc.moveDown(0.8);

  const rowHeight = 18;
  const drawHeader = () => {
    let x = left;
    doc.fontSize(9).fillColor("#1c2230").font("Helvetica-Bold");
    for (const c of cols) {
      doc.text(c.header, x + 2, doc.y, { width: c.w - 4, align: c.align ?? "left", lineBreak: false });
      x += c.w;
    }
    doc.moveDown(0.3);
    doc.moveTo(left, doc.y).lineTo(right, doc.y).strokeColor("#d2dae6").stroke();
    doc.moveDown(0.2);
    doc.font("Helvetica");
  };

  drawHeader();
  for (const row of opts.rows) {
    if (doc.y + rowHeight > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
      drawHeader();
    }
    let x = left;
    const y = doc.y;
    doc.fontSize(8.5).fillColor("#2b303b");
    for (const c of cols) {
      const v = row[c.key];
      doc.text(v == null ? "" : String(v), x + 2, y, { width: c.w - 4, align: c.align ?? "left", lineBreak: false });
      x += c.w;
    }
    doc.y = y + rowHeight;
  }

  doc.end();
}
