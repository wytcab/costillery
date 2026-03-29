"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentLedger = void 0;
class AgentLedger {
    constructor(options) {
        this.queue = [];
        // Store 402 challenges keyed by URL — cleared after corresponding 200
        this.pendingChallenges = new Map();
        this.apiKey = options.apiKey;
        this.endpoint = (options.endpoint || 'https://receipts.chancelove.ai').replace(/\/$/, '');
        this.projectTag = options.projectTag;
        this.departmentTag = options.departmentTag;
        this.batchSize = options.batchSize || 10;
        this.batchIntervalMs = options.batchIntervalMs || 5000;
        this.maxQueueSize = options.maxQueueSize || 1000;
        this.debug = options.debug || false;
        this.startFlushTimer();
    }
    startFlushTimer() {
        this.flushTimer = setInterval(() => {
            this.flush().catch(() => { });
        }, this.batchIntervalMs);
        if (this.flushTimer && typeof this.flushTimer === 'object' && 'unref' in this.flushTimer) {
            this.flushTimer.unref();
        }
    }
    buildPayload(receipt, urlStr) {
        // Check for pending 402 challenge for this URL
        const challenge = this.pendingChallenges.get(urlStr);
        if (challenge) {
            this.pendingChallenges.delete(urlStr); // Consume the challenge
        }
        const metadata = receipt.metadata || {};
        if (this.projectTag)
            metadata.project = this.projectTag;
        if (this.departmentTag)
            metadata.department = this.departmentTag;
        return {
            receipt_raw: receipt.receipt_raw || '',
            service_url: urlStr,
            protocol: receipt.protocol || 'manual',
            challenge_raw: challenge?.challengeRaw || receipt.challenge_raw || undefined,
            metadata,
        };
    }
    async submitReceipt(receipt, urlStr) {
        const targetUrl = urlStr || receipt.service_url || '';
        const payload = this.buildPayload(receipt, targetUrl);
        this.queue.push(payload);
        if (this.queue.length >= this.batchSize) {
            await this.flush();
        }
    }
    async submitBatch(receipts) {
        const response = await fetch(`${this.endpoint}/v1/receipts`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ receipts })
        });
        if (!response.ok) {
            throw new Error(`AgentLedger API error: ${response.status} ${response.statusText}`);
        }
        return response.json();
    }
    async flush() {
        if (this.queue.length === 0)
            return;
        const toSend = this.queue.splice(0, this.queue.length);
        try {
            const result = await this.submitBatch(toSend);
            if (this.debug) {
                console.log(`AgentLedger: Flushed ${toSend.length} receipts (accepted=${result.accepted}, rejected=${result.rejected})`);
            }
        }
        catch (err) {
            if (this.debug)
                console.error('AgentLedger: Flush failed, re-queuing', err);
            this.queue.unshift(...toSend);
            throw err;
        }
    }
    /**
     * Parse a WWW-Authenticate: Payment header value into base64-encoded JSON.
     * Format: Payment realm="...", x402-version="1", algorithm="...", payto="...",
     *         max-amount="...", expires="...", salt="...", ...
     *         OR: Payment x402-version=2, network=..., payto=..., max-amount=...
     *
     * We extract the key fields and encode as base64 JSON for storage.
     */
    parseWwwAuthenticate(header) {
        try {
            // Try to extract embedded JSON after "error=" or as a JSON block
            // Format varies: "Payment error=base64json, ..." or just "Payment base64json"
            const parts = header.split(',').map(p => p.trim());
            const parsed = {};
            for (const part of parts) {
                const eqIdx = part.indexOf('=');
                if (eqIdx === -1)
                    continue;
                const key = part.substring(0, eqIdx).trim().toLowerCase().replace(/-/g, '_');
                let value = part.substring(eqIdx + 1).trim().replace(/^"|"$/g, '');
                // Try to parse nested JSON (after "error=")
                if (key === 'error' || key === 'challenge') {
                    try {
                        const decoded = Buffer.from(value, 'base64').toString('utf8');
                        const inner = JSON.parse(decoded);
                        Object.assign(parsed, inner);
                        parsed._raw_error_b64 = value;
                        continue;
                    }
                    catch {
                        // Not base64 JSON — store as-is
                    }
                }
                parsed[key] = value;
            }
            // Encode the parsed object back as base64 for the API
            const raw = Buffer.from(JSON.stringify(parsed)).toString('base64');
            return { raw, parsed };
        }
        catch {
            return null;
        }
    }
    /** Wrap global fetch to auto-capture MPP and x402 payment headers */
    wrapFetch(originalFetch) {
        const ledger = this;
        return async function interceptedFetch(input, init) {
            const urlStr = typeof input === 'string'
                ? input
                : input instanceof URL
                    ? input.href
                    : input.url;
            let response;
            try {
                response = await originalFetch(input, init);
            }
            catch (err) {
                // Network error — propagate
                throw err;
            }
            const status = response.status;
            const headers = response.headers;
            // === 402 Response: Capture the WWW-Authenticate challenge ===
            if (status === 402) {
                const wwwAuth = headers.get('WWW-Authenticate') || headers.get('www-authenticate');
                if (wwwAuth && wwwAuth.toLowerCase().startsWith('payment')) {
                    const parsed = ledger.parseWwwAuthenticate(wwwAuth);
                    if (parsed) {
                        // Store challenge keyed by URL — will be consumed when 200 arrives
                        ledger.pendingChallenges.set(urlStr, {
                            challenge: wwwAuth,
                            challengeRaw: parsed.raw,
                            url: urlStr,
                            timestamp: new Date().toISOString(),
                        });
                        if (ledger.debug) {
                            console.log(`AgentLedger: Captured 402 challenge for ${urlStr}`);
                        }
                    }
                }
                return response; // Still return the 402 to caller
            }
            // === 200 Response: Check for payment receipts ===
            if (status === 200) {
                // MPP Payment-Receipt header
                const mppReceipt = headers.get('Payment-Receipt');
                if (mppReceipt) {
                    ledger.submitReceipt({
                        receipt_raw: mppReceipt,
                        service_url: urlStr,
                        protocol: 'mpp',
                    }, urlStr).catch(() => { });
                }
                // x402 Payment-Response header (V1: X-Payment-Response, V2: Payment-Response)
                const x402Receipt = headers.get('X-Payment-Response') || headers.get('Payment-Response');
                if (x402Receipt) {
                    // For x402, the challenge was already captured on the 402 — look it up
                    ledger.submitReceipt({
                        receipt_raw: x402Receipt,
                        service_url: urlStr,
                        protocol: 'x402',
                    }, urlStr).catch(() => { });
                }
            }
            return response;
        };
    }
    async flushNow() {
        await this.flush();
    }
    async shutdown() {
        if (this.flushTimer)
            clearInterval(this.flushTimer);
        await this.flush();
    }
    /** Expose pending challenge count (useful for debugging) */
    getPendingChallengeCount() {
        return this.pendingChallenges.size;
    }
}
exports.AgentLedger = AgentLedger;
