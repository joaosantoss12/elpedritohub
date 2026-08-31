import type ExcelJS from 'exceljs';
import { type Aposta, apostaProfit, apostaRetorno, sortApostas } from './banca';
import type { BancaStats } from './bancaStats';
import { fmtDay } from './bancaFormat';

// paleta alinhada com o Hub (dourado)
const C = {
  primary: 'FFB8860B',
  primaryDark: 'FF8A6508',
  accent: 'FFE6B95C',
  ink: 'FF0F172A',
  muted: 'FF64748B',
  line: 'FFE2E8F0',
  zebra: 'FFF8FAFC',
  green: 'FF047857',
  greenSoft: 'FFD1FAE5',
  red: 'FFB91C1C',
  redSoft: 'FFFEE2E2',
  amber: 'FFB45309',
  amberSoft: 'FFFEF3C7',
  slateSoft: 'FFF1F5F9',
} as const;

const MONEY = '#,##0.00" €"';
const SIGNED_MONEY = '+#,##0.00" €";-#,##0.00" €";0.00" €"';

const ESTADO_PT: Record<Aposta['estado'], string> = {
  ganha: 'Green',
  perdida: 'Red',
  pendente: 'Pendente',
};

const ESTADO_FILL: Record<Aposta['estado'], { bg: string; fg: string }> = {
  ganha: { bg: C.greenSoft, fg: C.green },
  perdida: { bg: C.redSoft, fg: C.red },
  pendente: { bg: C.amberSoft, fg: C.amber },
};

const fill = (argb: string): ExcelJS.Fill => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
const thin = { style: 'thin' as const, color: { argb: C.line } };

function jogo(a: Aposta): string {
  if (a.tipo === 'multipla' && a.selecoes?.length) {
    return a.selecoes
      .map((s) => `${s.equipa_casa} vs ${s.equipa_fora}${s.mercado ? ` (${s.mercado})` : ''}`)
      .join('  +  ');
  }
  return `${a.equipa_casa}  vs  ${a.equipa_fora}`;
}

export async function downloadBancaExcel(apostas: Aposta[], stats: BancaStats, currency = 'EUR') {
  const rows = sortApostas(apostas);
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  wb.creator = 'EL PEDRITO HUB';
  wb.created = new Date();

  const ws = wb.addWorksheet('Banca', {
    views: [{ showGridLines: false, state: 'frozen', ySplit: 8 }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  ws.columns = [
    { width: 13 }, { width: 34 }, { width: 26 }, { width: 9 },
    { width: 13 }, { width: 13 }, { width: 13 }, { width: 16 },
  ];

  const cur = currency === 'EUR' ? '€' : currency;
  const moneyStr = (v: number) => `${v.toFixed(2).replace('.', ',')} ${cur}`;

  ws.mergeCells('A1:H1');
  const title = ws.getCell('A1');
  title.value = 'BANCA · EL PEDRITO HUB';
  title.font = { name: 'Calibri', size: 18, bold: true, color: { argb: 'FFFFFFFF' } };
  title.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  title.fill = fill(C.primary);
  ws.getRow(1).height = 34;

  ws.mergeCells('A2:H2');
  const sub = ws.getCell('A2');
  const now = new Date().toISOString().slice(0, 10);
  sub.value = `Exportado a ${fmtDay(now)}    ·    ${rows.length} aposta${rows.length === 1 ? '' : 's'}`;
  sub.font = { name: 'Calibri', size: 10, color: { argb: 'FFFFFFFF' } };
  sub.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  sub.fill = fill(C.primaryDark);
  ws.getRow(2).height = 20;
  ws.getRow(3).height = 8;

  const summary: [string, string, ('green' | 'red')?][] = [
    ['Banca inicial', moneyStr(stats.bankrollStart)],
    ['Banca final', moneyStr(stats.bankrollEnd)],
    ['Lucro / Prejuízo', `${stats.profit >= 0 ? '+' : ''}${moneyStr(stats.profit)}`, stats.profit >= 0 ? 'green' : 'red'],
    ['ROI', `${stats.roi >= 0 ? '+' : ''}${stats.roi.toFixed(1).replace('.', ',')} %`, stats.roi >= 0 ? 'green' : 'red'],
    ['Taxa de vitória', `${stats.winRate.toFixed(1).replace('.', ',')} %`],
    ['Green / Red', `${stats.greens} / ${stats.reds}`],
    ['Odd média', stats.avgOdd.toFixed(2).replace('.', ',')],
    ['Total investido', moneyStr(stats.staked)],
  ];

  const labelRow = ws.getRow(4);
  const valueRow = ws.getRow(5);
  labelRow.height = 16;
  valueRow.height = 22;
  summary.forEach(([label, value, tone], i) => {
    const col = i + 1;
    const lc = labelRow.getCell(col);
    lc.value = label.toUpperCase();
    lc.font = { name: 'Calibri', size: 8, bold: true, color: { argb: C.muted } };
    lc.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
    lc.fill = fill(C.slateSoft);

    const vc = valueRow.getCell(col);
    vc.value = value;
    vc.font = {
      name: 'Calibri', size: 11, bold: true,
      color: { argb: tone === 'green' ? C.green : tone === 'red' ? C.red : C.ink },
    };
    vc.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
    vc.fill = fill(C.slateSoft);
    vc.border = { bottom: { style: 'medium', color: { argb: C.accent } } };
  });
  ws.getRow(6).height = 10;

  const HEAD_ROW = 8;
  const headers = ['Data', 'Jogo', 'Mercado', 'Odd', 'Valor', 'Retorno', 'Estado', 'Lucro / Prejuízo'];
  const hr = ws.getRow(HEAD_ROW);
  hr.height = 22;
  headers.forEach((h, i) => {
    const cell = hr.getCell(i + 1);
    cell.value = h;
    cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = fill(C.primary);
    cell.alignment = {
      vertical: 'middle',
      horizontal: i >= 3 ? 'center' : 'left',
      indent: i >= 3 ? 0 : 1,
    };
    cell.border = { bottom: { style: 'medium', color: { argb: C.primaryDark } } };
  });

  rows.forEach((a, idx) => {
    const r = ws.getRow(HEAD_ROW + 1 + idx);
    r.height = 18;
    const base = idx % 2 === 1 ? fill(C.zebra) : undefined;
    const profit = apostaProfit(a);
    const cells: {
      v: ExcelJS.CellValue; align?: 'left' | 'center'; numFmt?: string;
      bold?: boolean; color?: string; fillOverride?: ExcelJS.Fill;
    }[] = [
      { v: fmtDay(a.data_aposta), align: 'left' },
      { v: a.tipo === 'multipla' ? `[Múltipla] ${jogo(a)}` : jogo(a), align: 'left', bold: true },
      { v: a.tipo === 'multipla' ? `${a.selecoes?.length ?? 0} seleções` : a.mercado, align: 'left' },
      { v: Number(a.odd), align: 'center', numFmt: '0.00' },
      { v: Number(a.valor_apostado), align: 'center', numFmt: MONEY },
      { v: a.estado === 'ganha' ? apostaRetorno(a) : a.estado === 'pendente' ? '—' : 0, align: 'center', numFmt: MONEY },
      {
        v: ESTADO_PT[a.estado], align: 'center', bold: true,
        color: ESTADO_FILL[a.estado].fg, fillOverride: fill(ESTADO_FILL[a.estado].bg),
      },
      {
        v: a.estado === 'pendente' ? '—' : profit, align: 'center', numFmt: SIGNED_MONEY, bold: true,
        color: profit > 0 ? C.green : profit < 0 ? C.red : C.muted,
      },
    ];
    cells.forEach((c, i) => {
      const cell = r.getCell(i + 1);
      cell.value = c.v;
      if (c.numFmt && typeof c.v === 'number') cell.numFmt = c.numFmt;
      cell.font = { name: 'Calibri', size: 10, bold: c.bold, color: { argb: c.color ?? C.ink } };
      cell.alignment = { vertical: 'middle', horizontal: c.align ?? 'left', indent: c.align === 'left' ? 1 : 0 };
      if (c.fillOverride) cell.fill = c.fillOverride;
      else if (base) cell.fill = base;
      cell.border = { bottom: thin };
    });
  });

  const totalRow = ws.getRow(HEAD_ROW + 1 + rows.length);
  totalRow.height = 20;
  const totStake = rows.reduce((s, a) => s + Number(a.valor_apostado), 0);
  const totReturn = rows.reduce((s, a) => s + apostaRetorno(a), 0);
  const totProfit = rows.reduce((s, a) => s + apostaProfit(a), 0);
  const totCells: (ExcelJS.CellValue | null)[] = ['TOTAL', null, null, null, totStake, totReturn, null, totProfit];
  totCells.forEach((v, i) => {
    const cell = totalRow.getCell(i + 1);
    if (v !== null) cell.value = v;
    if (typeof v === 'number') cell.numFmt = i === 7 ? SIGNED_MONEY : MONEY;
    cell.font = {
      name: 'Calibri', size: 10, bold: true,
      color: { argb: i === 7 ? (totProfit >= 0 ? C.green : C.red) : C.ink },
    };
    cell.alignment = { vertical: 'middle', horizontal: i >= 3 ? 'center' : 'left', indent: i >= 3 ? 0 : 1 };
    cell.fill = fill(C.slateSoft);
    cell.border = { top: { style: 'medium', color: { argb: C.accent } } };
  });

  ws.autoFilter = { from: { row: HEAD_ROW, column: 1 }, to: { row: HEAD_ROW, column: 8 } };

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `banca-el-pedrito-${now}.xlsx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
