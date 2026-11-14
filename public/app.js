function meterApp() {
  return {
    date: new Date().toLocaleDateString('en-CA'),
    data: { batches: [], scans: [], total_scanned: 0, completed_batches: 0 },
    meter: '', busy: false, loading: true, message: '', messageType: 'ok',
    tab: 'scan', scanQueue: [], scannerReady: false, lastScan: '',
    get currentBatch() { return this.data.batches.find(b => Number(b.scanned_count) < 27) || null; },
    get batchNumber() { return this.currentBatch ? Number(this.currentBatch.batch_number) : this.data.batches.length + 1; },
    get batchCount() { return this.currentBatch ? Number(this.currentBatch.scanned_count) : 0; },
    get remaining() { return 27 - this.batchCount; },
    get queueCount() { return this.scanQueue.length; },
    async init() {
      await this.load();
      this.$nextTick(() => this.focusScanner());
    },
    focusScanner() {
      if (this.tab === 'scan') {
        const el = this.$refs.scanner;
        if (el && !el.disabled) el.focus({ preventScroll: true });
      }
    },
    scannerFocused() { this.scannerReady = true; },
    scannerBlurred() { this.scannerReady = false; },
    async load() {
      this.loading = true;
      try {
        const r = await fetch('/api/tracking?date=' + encodeURIComponent(this.date), { headers: { 'Accept': 'application/json' } });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || 'Could not load records');
        this.data = d;
      } catch (e) {
        this.notify(e.message || 'Could not load records. Check your connection.', 'error');
      } finally {
        this.loading = false;
      }
    },
    notify(text, type = 'ok') {
      this.message = text;
      this.messageType = type;
    },
    scan() {
      const number = String(this.meter || '').trim();
      if (!number) return;
      this.meter = '';
      this.scanQueue.push(number);
      this.processQueue();
      this.$nextTick(() => this.focusScanner());
    },
    async processQueue() {
      if (this.busy) return;
      this.busy = true;
      while (this.scanQueue.length) {
        const number = this.scanQueue.shift();
        try {
          const r = await fetch('/api/tracking', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify({ meter_number: number, work_date: this.date })
          });
          const d = await r.json();
          if (r.status === 409) {
            this.lastScan = number;
            this.notify((d.error || 'Duplicate meter number.') + (d.duplicate?.work_date ? ' First recorded on ' + d.duplicate.work_date : ''), 'error');
          } else if (!r.ok) {
            this.meter = number;
            this.notify(d.error || 'Scan failed. The number has been put back in the input for retry.', 'error');
            break;
          } else {
            this.lastScan = number;
            this.notify(d.message + ' — ' + number, d.batch.status === 'completed' ? 'complete' : 'ok');
            await this.load();
          }
        } catch (e) {
          this.meter = number;
          this.notify('Connection problem. This scan was not confirmed. The number is back in the input; check the connection and retry.', 'error');
          break;
        }
      }
      this.busy = false;
      this.$nextTick(() => this.focusScanner());
    },
    async changeDate(value) {
      this.date = value;
      await this.load();
      this.$nextTick(() => this.focusScanner());
    },
    exportExcel() {
      window.location.href = '/api/export?date=' + encodeURIComponent(this.date);
    },
    setTab(tab) {
      this.tab = tab;
      if (tab === 'scan') this.$nextTick(() => this.focusScanner());
    }
  };
}