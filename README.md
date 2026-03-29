# Costillery

**Receipt intelligence for AI agents.**

Costillery automatically captures payment receipts from AI agents running on MPP and x402 payment protocols. Every transaction — search queries, API calls, compute requests — gets logged, enriched with service metadata, and organized for expense tracking and commerce analytics.

---

## Install

```bash
npm install costillery
```

Requires Node.js 18+.

---

## Quick Start

```javascript
import { Costillery } from 'costillery';

const ledger = new Costillery({
  apiKey: 'al_live_your_api_key_here',
  projectTag: 'research-q1',
  departmentTag: 'engineering',
});


// Wrap global fetch — every MPP/x402 response is auto-captured
globalThis.fetch = ledger.wrapFetch(globalThis.fetch);

// Or use with axios (x402 ecosystem)
import { wrapAxios } from 'costillery';
const ledger = wrapAxios(axios.create(), {
  apiKey: 'al_live_your_api_key_here',
});

// Manual submission
await ledger.submitReceipt({
  receipt_raw: 'base64_encoded_payment_receipt',
  service_url: 'https://api.some-service.com/search',
  protocol: 'mpp',
});
```

### Two Modes to Use Costillery

#### Mode 1: API Key (Teams & Dashboards)
```javascript
import { Costillery } from 'costillery'

// Track receipts with an API key
const ledger = new Costillery({ apiKey: 'al_live_xxx' })
const wrappedFetch = ledger.wrapFetch(fetch)

// Now every API call is automatically wrapped
const response = await wrappedFetch('https://api.openai.com/v1/models', initOptions)
```

Free up to 5,000 receipts/mo. Upgrade to Pro for 100,000/mo. Includes dashboard, CSV export, alerts, team management.

#### Mode 2: MPP (Agents — No Signup)
```javascript
import { Costillery } from 'costillery'

// No API key needed — agents pay per receipt via MPP
const ledger = new Costillery({ wallet: privateKey, mode: 'mpp' })
const wrappedFetch = ledger.wrapFetch(fetch)

// The first API call triggers a $0.002 payment challenge.
// The agent's wallet signs and pays automatically.
// Subsequent calls are signed and tracked.
const response = await wrappedFetch('https://api.openai.com/v1/models', initOptions)
```

No account needed. $0.002 per receipt, settled on Tempo mainnet. Query your spending:
- `GET /v1/wallet/:address/summary` — $0.005 per query
- `GET /v1/wallet/:address/receipts` — $0.005 per query

**Claim your receipts into a dashboard account at [costillery.com/claim](https://costillery.com/claim)**

### Which mode should I use?
| | API Key | MPP |
|--|---------|-----|
| Best for | Teams, dashboards, exports | Agents, no-signup flows |
| Auth | API key | Wallet + micro-payment |
| Free tier | 5,000 receipts/mo | Pay per receipt |
| Requires | Sign up | Nothing — just a wallet |

### Submit receipts directly (no SDK)
```bash
# API key mode
curl -X POST https://api.costillery.com/v1/receipts \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"receipt_raw": "...", "service_url": "https://api.openai.com"}'

# MPP mode (no auth header)
curl -X POST https://api.costillery.com/v1/receipts \
  -H "Content-Type: application/json" \
  -d '{"receipt_raw": "..."}'
```

---

## Configuration

```typescript
new Costillery({
  apiKey: string;                    // Required. Your Costillery API key.
  endpoint?: string;                  // Default: 'https://api.costillery.com'
  projectTag?: string;               // Optional project label for all receipts
  departmentTag?: string;            // Optional department label
  batchSize?: number;                // Flush after N receipts. Default: 10
  batchIntervalMs?: number;           // Flush interval. Default: 5000ms
  maxQueueSize?: number;             // Max receipts in memory. Default: 1000
  debug?: boolean;                   // Log submissions. Default: false
});
```

---

## How It Works

### 1. wrapFetch (MPP Protocol)

When you wrap `globalThis.fetch`, every HTTP response is intercepted:

- If the response has a `Payment-Receipt` header → receipt is extracted and submitted to Costillery
- The header contains the actual amount paid, currency, settlement rail, and transaction reference

### 2. wrapFetch (x402 Protocol)

x402 payments use a challenge/response flow:

1. Agent makes a request → server returns `402 Payment Required` with a `WWW-Authenticate: Payment` header
2. Costillery captures the challenge (which contains the **requested amount** — critical for x402 where the receipt has no amount)
3. Agent pays on-chain
4. Server returns `200 OK` with a `Payment-Response` header (the receipt)
5. Costillery attaches the captured challenge to the receipt and submits both

### 3. Manual Submission

For custom integrations:

```typescript
await ledger.submitReceipt({
  receipt_raw: 'base64_encoded_receipt',    // From Payment-Receipt or Payment-Response header
  challenge_raw: 'base64_encoded_challenge',  // From WWW-Authenticate header (x402)
  service_url: 'https://api.service.com/',
  protocol: 'mpp',                           // 'mpp', 'x402', or 'manual'
  metadata: { project: 'q1-research', department: 'eng' }
});
```

---

## Receipt Enrichment

Every receipt is enriched with:

| Field | Description |
|-------|-------------|
| `service_name` | e.g. "Parallel", "OpenAI" |
| `service_category` | e.g. `["search", "ai"]` |
| `settlement_rail` | `crypto_tempo`, `fiat_stripe`, `crypto_base`, etc. |
| `amount_usd` | Normalized to USD |
| `protocol` | `mpp`, `x402`, or `manual` |

The service directory syncs hourly from `mpp.dev` and maps real API URLs (e.g. `api.openai.com`) to service names, so receipts submitted with production URLs get matched correctly.

---

## Dashboard

Track your agent spend at [app.costillery.com](https://app.costillery.com).

Or query the API directly:

```bash
# Get spend summary
curl https://api.costillery.com/v1/dashboard/summary \
  -H "Authorization: Bearer al_live_your_key"

# Export as CSV
curl "https://api.costillery.com/v1/export?format=csv&from=2026-03-01" \
  -H "Authorization: Bearer al_live_your_key" \
  -o receipts.csv
```

---

## API Docs

Full API reference: [docs.costillery.com](https://docs.costillery.com)

---

## Get an API Key

Sign up at [costillery.com](https://costillery.com) — free tier includes 5,000 receipts/month.

---

## Protocol Support

| Protocol | Receipt Header | Challenge Header |
|----------|---------------|-----------------|
| MPP | `Payment-Receipt` | N/A |
| x402 V1 | `X-Payment-Response` | `WWW-Authenticate: Payment` |
| x402 V2 | `Payment-Response` | `WWW-Authenticate: Payment` |

---

## License

Proprietary — The Skramme Company
