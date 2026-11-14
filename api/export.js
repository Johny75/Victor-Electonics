import { db } from 'hatchable';

export const access = 'member';
export const methods = ['GET'];

function validDate(value) {
  return typeof value === 'string' && /^\\d{4}-\\d{2}-\\d{2}$/.test(value);
}
function xml(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}
function cell(value, type = 'String') {
  return '<Cell><Data ss:Type="' + type + '">' + xml(value) + '</Data></Cell>';
}
function row(values) {
  return '<Row>' + values.map(v => cell(v)).join('') + '</Row>';
}

export default async function (req, res) {
  const date = validDate(req.query?.date) ? req.query.date : new Date().toISOString().slice(0, 10);
  const records = await db.query(
    `SELECT s.meter_number
     FROM meter_scans s
     WHERE s.work_date = $1
     ORDER BY s.scanned_at, s.id`,
    [date]
  );

  const rows = [row(['Serial Number', 'Meter Number'])];
  records.rows.forEach((item, index) => {
    rows.push('<Row>' + cell(index + 1, 'Number') + cell(item.meter_number) + '</Row>');
  });

  const workbook = '<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?>' +
    '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">' +
    '<Worksheet ss:Name="Meter Records"><Table>' + rows.join('') + '</Table></Worksheet>' +
    '</Workbook>';
  res.setHeader('Content-Type', 'application/vnd.ms-excel; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="meter-tracking-' + date + '.xls"');
  return res.send('\\uFEFF' + workbook);
}