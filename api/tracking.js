import { db } from 'hatchable';

export const access = 'admin';
export const methods = ['GET', 'POST'];

function validDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export default async function (req, res) {
  try {
    if (req.method === 'GET') {
      const date = validDate(req.query?.date) ? req.query.date : new Date().toISOString().slice(0, 10);
      const batchesResult = await db.query(
        `SELECT b.id, b.work_date, b.batch_number, b.status, b.created_at, b.completed_at,
          COUNT(s.id)::int AS scanned_count
         FROM meter_batches b
         LEFT JOIN meter_scans s ON s.batch_id = b.id
         WHERE b.work_date = $1
         GROUP BY b.id
         ORDER BY b.batch_number`,
        [date]
      );
      const scansResult = await db.query(
        `SELECT s.id, s.meter_number, s.work_date, s.scanned_at, b.batch_number
         FROM meter_scans s JOIN meter_batches b ON b.id = s.batch_id
         WHERE s.work_date = $1 ORDER BY s.scanned_at DESC, s.id DESC LIMIT 500`,
        [date]
      );
      const total = batchesResult.rows.reduce((n, b) => n + Number(b.scanned_count), 0);
      return res.json({ date, batch_size: 27, total_scanned: total, completed_batches: batchesResult.rows.filter(b => Number(b.scanned_count) === 27).length, batches: batchesResult.rows, scans: scansResult.rows });
    }

    const body = req.body || {};
    const meter = String(body.meter_number || '').trim();
    const date = validDate(body.work_date) ? body.work_date : null;
    if (!date) return res.status(400).json({ error: 'A valid work date is required.' });
    if (!meter || meter.length > 80 || !/^[A-Za-z0-9_-]+$/.test(meter)) {
      return res.status(400).json({ error: 'Enter a valid meter number using letters, numbers, hyphens or underscores.' });
    }

    const duplicate = await db.query('SELECT id, work_date FROM meter_scans WHERE meter_number = $1 LIMIT 1', [meter]);
    if (duplicate.rows.length) {
      return res.status(409).json({ error: 'This meter number has already been scanned.', duplicate: duplicate.rows[0] });
    }

    let batchResult = await db.query(
      `SELECT b.id, b.batch_number, COUNT(s.id)::int AS scanned_count
       FROM meter_batches b LEFT JOIN meter_scans s ON s.batch_id = b.id
       WHERE b.work_date = $1
       GROUP BY b.id HAVING COUNT(s.id) < 27
       ORDER BY b.batch_number DESC LIMIT 1`,
      [date]
    );

    let batch;
    if (batchResult.rows.length) {
      batch = batchResult.rows[0];
    } else {
      const next = await db.query('SELECT COALESCE(MAX(batch_number), 0)::int + 1 AS next_number FROM meter_batches WHERE work_date = $1', [date]);
      const created = await db.query(
        'INSERT INTO meter_batches (work_date, batch_number) VALUES ($1, $2) RETURNING id, batch_number',
        [date, next.rows[0].next_number]
      );
      batch = { ...created.rows[0], scanned_count: 0 };
    }

    const inserted = await db.query(
      'INSERT INTO meter_scans (batch_id, meter_number, work_date) VALUES ($1, $2, $3) RETURNING id, meter_number, scanned_at',
      [batch.id, meter, date]
    );
    const count = Number(batch.scanned_count) + 1;
    if (count === 27) {
      await db.query("UPDATE meter_batches SET status = 'completed', completed_at = now() WHERE id = $1", [batch.id]);
    }
    return res.status(201).json({
      success: true,
      scan: inserted.rows[0],
      batch: { id: batch.id, batch_number: batch.batch_number, scanned_count: count, remaining: 27 - count, status: count === 27 ? 'completed' : 'in_progress' },
      message: count === 27 ? 'Batch completed. The next batch is ready.' : 'Meter recorded successfully.'
    });
  } catch (error) {
    if (String(error?.message || '').toLowerCase().includes('unique')) {
      return res.status(409).json({ error: 'This meter number has already been scanned.' });
    }
    console.error('Meter tracking request failed:', error?.message || error);
    return res.status(500).json({ error: 'Something went wrong while processing the meter. Please try again.' });
  }
}