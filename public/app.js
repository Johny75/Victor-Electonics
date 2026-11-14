function meterApp() {
  return {
    date: new Date().toLocaleDateString('en-CA'),
    data: { batches: [], scans: [], total_scanned: 0, completed_batches: 0 },
    meter: '', busy: false, loading: true, message: '', messageType: 'ok',
    tab: 'scan',
    get currentBatch() { return this.data.batches.find(b => Number(b.scanned_count) < 27) || null; },
    get batchNumber() { return this.currentBatch ? Number(this.currentBatch.batch_number) : this.data.batches.length + 1; },
    get batchCount() { return this.currentBatch ? Number(this.currentBatch.scanned_count) : 0; },
    get remaining() { return 27 - this.batchCount; },
    get totalCapacity() { return this.data.batches.length * 27; },
    async init() { await this.load(); this.$nextTick(() => this.focusScanner()); },
    focusScanner() { if (this.tab === 'scan' && !this.busy) this.$refs.scanner?.focus(); },
    async load() {
      this.loading = true;
      try {
        const r = await fetch('/api/tracking?date=' + encodeURIComponent(this.date));
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || 'Could not load records');
        this.data = d;
      } catch(e) { this.notify(e.message, 'error'); }
      this.loading = false;
    },
    notify(text, type='ok') { this.message = text; this.messageType = type; },
    async scan() {
      const number = this.meter.trim();
      if (!number || this.busy) return;
      this.busy = true;
      try {
        const r = await fetch('/api/tracking', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({meter_number:number, work_date:this.date}) });
        const d = await r.json();
        if (r.status === 409) { this.notify(d.error + (d.duplicate?.work_date ? ' First recorded on ' + d.duplicate.work_date : ''), 'error'); }
        else if (!r.ok) { this.notify(d.error || 'Scan failed. Try again.', 'error'); }
        else {
          this.notify(d.message + ' — ' + number, d.batch.status === 'completed' ? 'complete' : 'ok');
          this.meter = '';
          await this.load();
        }
      } catch(e) { this.notify('Connection problem. Scan was not confirmed; please retry.', 'error'); }
      this.busy = false;
      this.$nextTick(() => this.focusScanner());
    },
    async changeDate(value) { this.date = value; await this.load(); },
    exportExcel() { window.location.href = '/api/export?date=' + encodeURIComponent(this.date); },
    setTab(tab) { this.tab = tab; if (tab === 'scan') this.$nextTick(() => this.focusScanner()); }
  };
}