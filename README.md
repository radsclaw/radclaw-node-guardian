# Radclaw Node Guardian

[![test](https://github.com/radsclaw/radclaw-node-guardian/actions/workflows/test.yml/badge.svg)](https://github.com/radsclaw/radclaw-node-guardian/actions/workflows/test.yml)

Read-only Core Lightning monitoring and evidence-backed operational audits, paid in bitcoin over Lightning.

- **Service:** https://radsclaw.github.io/radclaw-node-guardian/
- **Live reference API:** https://radclaw.tail210fab.ts.net:10000/api/v1/status
- **Audit intake:** https://github.com/radsclaw/radclaw-node-guardian/issues/new?template=audit-request.yml

## Service

| Offer | Founding price | Delivery |
|---|---:|---|
| Guardian Monitoring | 20,000 sats/month | Automated health/degradation checks, alerts, weekly summary |
| Operations Audit | 50,000 sats | Configuration, exposure, supervision, backup, liquidity, and upgrade-risk report |

There are no automatic debits. Scope is approved before an invoice is presented. Settled payments attributable to completed work are the only revenue counted.

## Security model

The probe invokes only `getinfo` and `listpeerchannels` through a fixed `lightning-cli` argument array. It never requests payment, invoice, wallet, datastore, signing, channel-management, or secret-bearing RPCs.

The public report is rebuilt from an explicit nine-field allowlist:

```text
schema_version service generated_at status network version
block_height normal_channels receive_ready
```

The HTTP service:

- binds to `127.0.0.1` by default;
- accepts only `GET`, `HEAD`, and `OPTIONS`;
- serves fixed routes with no path-based file lookup;
- strips unexpected status fields again at the serving boundary;
- sets CSP, frame, content-type, referrer, permissions, and cache headers;
- rate-limits by direct socket address;
- accepts no uploads, credentials, commands, webhooks, or customer input.

Never submit a seed phrase, HSM secret, private key, rune, macaroon, NWC connection string, wallet password, BOLT11, payment hash, node/peer ID, private address, exact balance, or unredacted log in a public issue.

## Local verification

Requirements: Python 3.9+, Node.js 20+, and Core Lightning for live collection.

```bash
npm test
npm run check
python3 -m node_guardian.probe --output runtime/status.json
HOST=127.0.0.1 PORT=8765 STATUS_PATH="$PWD/runtime/status.json" node server.js
curl --fail http://127.0.0.1:8765/health
curl --fail http://127.0.0.1:8765/api/v1/status
```

## Deployment

The production pattern is:

1. `com.radclaw.node-guardian-probe` runs every five minutes and atomically refreshes a mode-0600 status file.
2. `com.radclaw.node-guardian` keeps the localhost HTTP process alive.
3. Tailscale Funnel terminates public TLS and proxies only the dedicated port.
4. No router port, CLN RPC socket, CLNRest endpoint, or wallet interface is public.

Example LaunchAgents are under `deploy/`. Copy them to `~/Library/LaunchAgents/`, replace `__PROJECT_ROOT__`, lint with `plutil -lint`, then bootstrap with `/bin/launchctl`.

## Repository layout

```text
node_guardian/probe.py     read-only collector and report builder
server.js                  fixed-route public HTTP boundary
public/                    service landing page
scripts/                   deployment entry points
deploy/                    LaunchAgent examples
tests/                     Python and Node regression tests
```

## Limitations

Node Guardian is operational support, not custody, insurance, financial advice, or a guarantee of uptime, routing success, profitability, payment delivery, or data recovery. The current live collector supports Core Lightning; other implementations require separate adapters and tests.

See [Privacy](PRIVACY.md) and [Terms](TERMS.md).
