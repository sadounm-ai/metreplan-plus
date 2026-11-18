// Lecture / écriture de classeurs Excel via ExcelJS (navigateur et Node).
import ExcelJS from 'exceljs';
import { parseDpgfRows, type CellValue, type DpgfParseResult, type SheetRows } from './dpgfParser';

export function cellToValue(v: ExcelJS.CellValue): CellValue {
  if (v == null) return null;
  if (typeof v === 'number' || typeof v === 'string') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object') {
    if ('result' in v) {
      const r = (v as { result?: unknown }).result;
      if (typeof r === 'number' || typeof r === 'string') return r;
      return null;
    }
    if ('richText' in v) return (v as ExcelJS.CellRichTextValue).richText.map((t) => t.text).join('');
    if ('text' in v) return String((v as { text: unknown }).text);
    if ('formula' in v || 'sharedFormula' in v) return null;
  }
  return null;
}

export async function readWorkbookRows(data: ArrayBuffer | Uint8Array): Promise<SheetRows[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(data as ArrayBuffer);
  const out: SheetRows[] = [];
  wb.eachSheet((ws) => {
    const rows: CellValue[][] = [];
    const maxCol = Math.min(ws.columnCount, 30);
    ws.eachRow({ includeEmpty: true }, (row, n) => {
      const vals: CellValue[] = [];
      for (let c = 1; c <= maxCol; c++) vals.push(cellToValue(row.getCell(c).value));
      rows[n - 1] = vals;
    });
    for (let i = 0; i < rows.length; i++) if (!rows[i]) rows[i] = [];
    out.push({ name: ws.name, rows });
  });
  return out;
}

export async function parseDpgfXlsx(data: ArrayBuffer | Uint8Array): Promise<DpgfParseResult> {
  return parseDpgfRows(await readWorkbookRows(data));
}
