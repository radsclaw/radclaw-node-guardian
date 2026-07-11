(() => {
  'use strict';
  const status = document.getElementById('live-status');
  const dot = document.getElementById('status-dot');
  if (!status || !dot) return;
  const api = location.hostname === 'radsclaw.github.io'
    ? 'https://radclaw.tail210fab.ts.net:10000/api/v1/status'
    : '/api/v1/status';
  fetch(api, { method: 'GET', mode: 'cors', credentials: 'omit', cache: 'no-store' })
    .then(response => {
      if (!response.ok) throw new Error('unavailable');
      return response.json();
    })
    .then(value => {
      const state = value.status === 'ok' ? 'ok' : 'degraded';
      dot.className = `dot ${state}`;
      status.textContent = `${state.toUpperCase()} · block ${Number.isInteger(value.block_height) ? value.block_height.toLocaleString() : 'unknown'} · ${Number(value.normal_channels) || 0} normal channel(s)`;
    })
    .catch(() => {
      dot.className = 'dot offline';
      status.textContent = 'PUBLIC MONITOR UNAVAILABLE';
    });
})();
