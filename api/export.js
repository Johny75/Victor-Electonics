import { db } from 'hatchable';

export const access = 'member';
export const methods = ['GET'];

function validDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
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
    `SELECT b.batch_number, s.meter_number, s.work_date, s.scanned_at
     FROM meter_scans s JOIN meter_batches b ON b.id = s.batch_id
     WHERE s.work_date = $1 ORDER BY b.batch_number, s.scanned_at, s.id`,
    [date]
  );
  const batches = await db.query(
    `SELECT b.batch_number, COUNT(s.id)::int AS scanned_count, b.status, b.created_at, b.completed_at
     FROM meter_batches b LEFT JOIN meter_scans s ON s.batch_id = b.id
     WHERE b.work_date = $1 GROUP BY b.id ORDER BY b.batch_number`,
    [date]
  );
  const recordRows = [row(['Batch', 'Meter Number', 'Work Date', 'Scan Time'])];
  for (const item of records.rows) recordRows.push(row([
    'Batch ' + String(item.batch_number).padStart(3, '0'),
    item.meter_number,
    item.work_date,
    item.scanned_at
  ]));
  const batchRows = [row(['Batch', 'Meters Scanned', 'Capacity', 'Remaining', 'Status', 'Started At', 'Completed At'])];
  for (const item of batches.rows) {
    const count = Number(item.scanned_count);
    batchRows.push(row([
      'Batch ' + String(item.batch_number).padStart(3, '0'),
      count, 27, 27 - count, count === 27 ? 'Completed' : 'In progress',
      item.created_at, item.completed_at || ''
    ]));
  }
  const workbook = '<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?>' +
    '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">' +
    '<Worksheet ss:Name="Meter Records"><Table>' + recordRows.join('') + '</Table></Worksheet>' +
    '<Worksheet ss:Name="Batch Summary"><Table>' + batchRows.join('') + '</Table></Worksheet>' +
    '</Workbook>';
  res.setHeader('Content-Type', 'application/vnd.ms-excel; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="meter-tracking-' + date + '.xls"');
  return res.send('\uFEFF' + workbook);
}