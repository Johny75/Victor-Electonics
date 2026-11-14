CREATE TABLE meter_batches (
  id BIGSERIAL PRIMARY KEY,
  work_date DATE NOT NULL,
  batch_number INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'in_progress',
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  completed_at TIMESTAMP,
  UNIQUE (work_date, batch_number)
);

CREATE TABLE meter_scans (
  id BIGSERIAL PRIMARY KEY,
  batch_id BIGINT NOT NULL REFERENCES meter_batches(id),
  meter_number TEXT NOT NULL UNIQUE,
  work_date DATE NOT NULL,
  scanned_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX idx_meter_batches_work_date ON meter_batches(work_date, batch_number);
CREATE INDEX idx_meter_scans_batch_id ON meter_scans(batch_id);
CREATE INDEX idx_meter_scans_work_date ON meter_scans(work_date, scanned_at);