import { PrismaClient } from "@prisma/client";
import * as XLSX from "xlsx";
import bcrypt from "bcryptjs";

// Usage: npx tsx scripts/import-xlsx.ts <file.xlsx> [year] [month1-12]
// Reads the "Monthly Attendance" sheet, upserts employees by Emp ID,
// and creates one AttendanceRecord per (employee, day) from the status codes.

const prisma = new PrismaClient();
const CODE: Record<string, string> = {
  P: "PRESENT", L: "LATE", A: "ABSENT", WFH: "WFH", CL: "CASUAL",
  SL: "SICK", PL: "PLANNED", CO: "COMP_OFF", LOP: "LOP", H: "HOLIDAY", EM: "EMERGENCY",
};
const MONTHS = ["january","february","march","april","may","june","july","august","september","october","november","december"];

async function main() {
  const [file, yArg, mArg] = process.argv.slice(2);
  if (!file) throw new Error("Pass the .xlsx path");
  const wb = XLSX.readFile(file);
  const ws = wb.Sheets["Monthly Attendance"] ?? wb.Sheets[wb.SheetNames[0]];
  const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: "" });

  // resolve month/year
  let year = Number(yArg), month0 = mArg ? Number(mArg) - 1 : NaN;
  for (const row of rows) {
    const line = row.map(String).join(" ").toLowerCase();
    if (line.includes("month:")) {
      const mi = MONTHS.findIndex((m) => line.includes(m));
      if (mi >= 0 && Number.isNaN(month0)) month0 = mi;
      const ym = line.match(/year:?\s*(\d{4})/);
      if (ym && !year) year = Number(ym[1]);
    }
  }
  if (!year || Number.isNaN(month0)) throw new Error("Could not resolve month/year — pass them as args");

  // locate header row (the one containing "Emp ID")
  const hIdx = rows.findIndex((r) => r.map(String).some((c) => c.trim().toLowerCase() === "emp id"));
  if (hIdx < 0) throw new Error("Header row not found");
  const header = rows[hIdx].map((c) => String(c).trim());
  const col = (name: string) => header.findIndex((h) => h.toLowerCase() === name.toLowerCase());
  const empCol = col("Emp ID"), nameCol = col("Employee Name"), desCol = col("Designation");
  // day columns: headers that are pure integers 1..31
  const dayCols = header.map((h, i) => ({ day: Number(h), i })).filter((d) => d.day >= 1 && d.day <= 31);

  let people = 0, records = 0;
  for (let r = hIdx + 1; r < rows.length; r++) {
    const row = rows[r];
    const empId = String(row[empCol] ?? "").trim();
    if (!/^E\d+/i.test(empId)) continue; // skip totals / blank rows
    const name = String(row[nameCol] ?? "").trim();
    const designation = String(row[desCol] ?? "").trim();

    const user = await prisma.user.upsert({
      where: { empId },
      update: { name, designation },
      create: { empId, name, designation, email: `${name.toLowerCase().replace(/\s+/g, ".")}@apophis.in`, passwordHash: bcrypt.hashSync("password123", 10), role: "VIEWER" },
    });
    people++;

    for (const { day, i } of dayCols) {
      const raw = String(row[i] ?? "").trim().toUpperCase();
      if (!raw || !CODE[raw]) continue; // blank = non-working day / not recorded
      const date = new Date(year, month0, day);
      await prisma.attendanceRecord.upsert({
        where: { userId_date: { userId: user.id, date } },
        update: { status: CODE[raw] as any, late: raw === "L" },
        create: { userId: user.id, date, status: CODE[raw] as any, late: raw === "L" },
      });
      records++;
    }
  }
  console.log(`Imported ${records} records for ${people} employees (${MONTHS[month0]} ${year}).`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
