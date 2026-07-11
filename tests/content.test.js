const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
function read(relative) { return fs.readFileSync(path.join(root, relative), 'utf8'); }

test('landing page publishes transparent prices and Lightning checkout route', () => {
  const html = read('public/index.html');
  assert.match(html, /20,000 sats\/month/);
  assert.match(html, /50,000 sats/);
  assert.match(html, /legendaryflame34@zeuspay\.com/);
  assert.match(html, /No automatic debits/);
  assert.match(html, /AI-assisted/);
});

test('landing page and intake explicitly reject secrets', () => {
  const combined = [
    read('public/index.html'),
    read('.github/ISSUE_TEMPLATE/audit-request.yml'),
    read('.github/ISSUE_TEMPLATE/monitoring-plan.yml'),
  ].join('\n');
  for (const term of ['seed phrase', 'private key', 'rune', 'macaroon', 'NWC']) {
    assert.match(combined, new RegExp(term, 'i'));
  }
  assert.match(combined, /never/i);
});

test('terms reject custody, financial advice, and guaranteed uptime', () => {
  const terms = read('TERMS.md');
  assert.match(terms, /non-custodial/i);
  assert.match(terms, /not financial advice/i);
  assert.match(terms, /not guarantee/i);
});

test('privacy policy limits collection and forbids credential submission', () => {
  const privacy = read('PRIVACY.md');
  assert.match(privacy, /data minimization/i);
  assert.match(privacy, /Do not submit/i);
  assert.match(privacy, /delete/i);
});

test('status updater changes to the project root before importing the module', () => {
  const script = read('scripts/update-status.sh');
  const cdPosition = script.indexOf('cd "$ROOT"');
  const pythonPosition = script.indexOf('python3 -m node_guardian.probe');
  assert.ok(cdPosition >= 0, 'script must cd to project root');
  assert.ok(pythonPosition > cdPosition, 'project-root cd must happen before Python module import');
});

test('static assets use relative links so GitHub project Pages works', () => {
  const html = read('public/index.html');
  assert.match(html, /href="styles\.css"/);
  assert.match(html, /src="app\.js"/);
  assert.doesNotMatch(html, /(?:href|src)="\/(?:styles\.css|app\.js)"/);
});

test('GitHub Pages status client uses a Funnel-supported public port', () => {
  const app = read('public/app.js');
  assert.match(app, /radclaw\.tail210fab\.ts\.net:10000\/api\/v1\/status/);
  assert.doesNotMatch(app, /tail210fab\.ts\.net:8765/);
});

test('mobile CSS prevents horizontal clipping and collapses dense grids', () => {
  const css = read('public/styles.css');
  assert.match(css, /html\{[^}]*overflow-x:hidden/);
  const mobile = css.slice(css.indexOf('@media(max-width:760px)'));
  assert.match(mobile, /\.proof\{grid-template-columns:1fr\}/);
  assert.match(mobile, /\.never-list\{grid-template-columns:1fr\}/);
  assert.match(mobile, /\.hero h1\{[^}]*overflow-wrap:anywhere/);
});

test('external watchdog checks health and independently validates fresh status', () => {
  const workflow = read('.github/workflows/public-watchdog.yml');
  assert.match(workflow, /schedule:/);
  assert.match(workflow, /permissions:\s*\{\}/);
  assert.match(workflow, /radclaw\.tail210fab\.ts\.net:10000\/health/);
  assert.match(workflow, /radclaw\.tail210fab\.ts\.net:10000\/api\/v1\/status/);
  assert.match(workflow, /schema_version.*!= 1/);
  assert.match(workflow, /schema_version.*isinstance/);
  assert.match(workflow, /service.*Radclaw Node Guardian/);
  assert.match(workflow, /network.*bitcoin/);
  assert.match(workflow, /block_height.*isinstance/);
  assert.match(workflow, /normal_channels.*isinstance/);
  assert.match(workflow, /isinstance.*receive_ready/);
  assert.match(workflow, /generated_at/);
  assert.match(workflow, /status.*ok/);
});
