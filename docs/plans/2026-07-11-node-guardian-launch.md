# Radclaw Node Guardian Launch Implementation Plan

> **For Hermes:** Use strict RED-GREEN-REFACTOR and independently review the public boundary before deployment.

**Goal:** Launch a public, Bitcoin-paid Core Lightning monitoring and audit service that proves its operation on RadclawNode without exposing private node, wallet, peer, payment, or credential data.

**Architecture:** A dependency-free Python probe invokes only read-only Core Lightning RPCs and produces two outputs: a private diagnostic report and a tightly allowlisted public status object. A small dependency-free Node HTTP service serves only a static landing page, public status, and health endpoint from localhost. Tailscale Funnel provides TLS/public ingress without opening a router port. GitHub hosts the source and issue-form intake; payment is arranged only after scope approval through the existing Lightning Address.

**Tech Stack:** Python 3.9 stdlib, Node.js stdlib, Core Lightning `lightning-cli`, Node test runner, Python unittest, GitHub Pages/repository, macOS launchd, Tailscale Funnel.

---

## Product and safety boundaries

- Public price: 50,000 sats one-time audit; 20,000 sats/month founding monitoring plan.
- No automatic debits. Customers approve and pay each invoice.
- No seeds, HSM secrets, runes, macaroons, NWC strings, BOLT11s, private keys, or spending credentials are ever requested.
- Public status exposes only service state, network name, software version, sync state, normal-channel count, and coarse receive-readiness boolean.
- Public service accepts GET/HEAD only, has no file-path input, no shell input, no customer upload endpoint, and rate-limits by remote address.
- Customer onboarding begins through structured GitHub issues with an explicit no-secrets warning.
- No payment is claimed as revenue until an attributable invoice settles.

## Task 1: Probe contract (TDD)

**Files:**
- Create: `tests/test_probe.py`
- Create: `node_guardian/probe.py`

1. Write tests for healthy, degraded, and unsynced fixtures.
2. Verify RED: module/function absent.
3. Implement `build_reports(getinfo, peerchannels)` with an explicit public allowlist.
4. Add tests proving node IDs, peer IDs, balances, addresses, aliases, payment hashes, runes, and arbitrary fixture fields cannot appear in public JSON.
5. Implement live read-only collection using fixed executable/argument arrays and configurable paths.
6. Verify all Python tests.

## Task 2: Public HTTP boundary (TDD)

**Files:**
- Create: `tests/public-server.test.js`
- Create: `server.js`

1. Write failing tests for `/health`, `/api/v1/status`, `/`, method rejection, unknown paths, security headers, CORS allowlist, and rate limiting.
2. Implement a localhost-bound dependency-free server with fixed routes and bounded response bodies.
3. Verify tests and Node syntax.

## Task 3: Landing page and intake

**Files:**
- Create: `public/index.html`
- Create: `public/styles.css`
- Create: `.github/ISSUE_TEMPLATE/audit-request.yml`
- Create: `.github/ISSUE_TEMPLATE/monitoring-plan.yml`
- Create: `PRIVACY.md`, `TERMS.md`, `README.md`

1. Publish clear scope, prices, limitations, and security boundary.
2. Link intake forms; warn users never to paste secrets or unredacted logs.
3. State that monitoring is operational support, not custody, insurance, financial advice, or a guarantee of uptime/profitability.
4. Include AI-assisted delivery disclosure and human approval boundaries.
5. Run HTML/link/content assertions.

## Task 4: Operations and deployment

**Files:**
- Create: `scripts/update-status.sh`
- Create: `scripts/start-server.sh`
- Create: `deploy/com.radclaw.node-guardian.plist.example`
- Create local LaunchAgent outside Git with the exact tested paths.

1. Generate public status atomically with private intermediate permissions.
2. Run service on `127.0.0.1:8765`.
3. Verify local health, status allowlist, and static site.
4. Enable Tailscale Funnel only for the dedicated service port.
5. Verify public TLS, GET routes, denied POST, headers, and absence of forbidden material.

## Task 5: Publish and operate

1. Initialize Git, commit only source/tests/docs; audit paths and content for secrets.
2. Create public `radsclaw/radclaw-node-guardian`, push, and verify remote SHA.
3. Enable issues and publish the landing URL.
4. Schedule local status refresh and private weekly lead/revenue review.
5. Independent P0/P1 review before claiming launch success.

## Acceptance criteria

- All Python and Node tests pass from a clean checkout.
- Live probe reports healthy against RadclawNode without printing identifiers or secrets.
- Public JSON contains exactly documented allowlisted keys.
- Public endpoint has valid TLS and no router/firewall port opening.
- POST/PUT/PATCH/DELETE are rejected.
- GitHub intake works and explicitly forbids secrets.
- Repository contains no runtime status, credentials, logs, node data, invoices, or wallet material.
- Launch report distinguishes a live offer from actual customers and settled revenue.
