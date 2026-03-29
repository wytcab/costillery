import { ReceiptPayload, AgentLedgerOptions, SubmitReceiptResponse } from './types.js';

interface PendingChallenge {
  challenge: string;
  challengeRaw: string;
  url: string;
  timestamp: string;
}

export class AgentLedger {
  private apiKey: string;
  private endpoint: string;
  private projectTag?: string;
  private departmentTag?: string;
  private queue: object[] = [];
  private batchSize: number;
  private batchIntervalMs: number;
  private maxQueueSize: number;
  private flushTimer?: ReturnType<typeof setInterval>;
  private debug: boolean;
  private pendingChallenges = new Map<string, PendingChallenge>();

  constructor(options: AgentLedgerOptions) {
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

  private startFlushTimer() {
    this.flushTimer = setInterval(() => { this.flush().catch(() => {}); }, this.batchIntervalMs);
    if (this.flushTimer && typeof this.flushTimer === 'object' && 'unref' in this.flushTimer) {
      (this.flushTimer as NodeJS.Timer & { unref?: () => void }).unref?.();
    }
  }

  private buildPayload(receipt: Partial<ReceiptPayload>, urlStr: string): object {
    const challenge = this.pendingChallenges.get(urlStr);
    if (challenge) this.pendingChallenges.delete(urlStr);
    const metadata = receipt.metadata || {};
    if (this.projectTag) metadata['project'] = this.projectTag;
    if (this.departmentTag) metadata['department'] = this.departmentTag;
    return {
      receipt_raw: receipt.receipt_raw || '',
      service_url: urlStr,
      protocol: receipt.protocol || 'manual',
      challenge_raw: challenge?.challengeRaw || receipt.challenge_raw || undefined,
      metadata,
    };
  }

  async submitReceipt(receipt: Partial<ReceiptPayload>, urlStr?: string): Promise<void> {
    const targetUrl = urlStr || receipt.service_url || '';
    const payload = this.buildPayload(receipt, targetUrl);
    this.queue.push(payload);
    if (this.queue.length >= this.batchSize) await this.flush();
  }

  async submitBatch(receipts: ReceiptPayload[]): Promise<SubmitReceiptResponse> {
    const response = await fetch(`${this.endpoint}/v1/receipts`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ receipts }),
    });
    if (!response.ok) throw new Error(`AgentLedger API error: ${response.status} ${response.statusText}`);
    return response.json();
  }

  async flush(): Promise<void> {
    if (this.queue.length === 0) return;
    const toSend = this.queue.splice(0, this.queue.length);
    try {
      const result = await this.submitBatch(toSend as ReceiptPayload[]);
      if (this.debug) console.log(`AgentLedger: Flushed ${toSend.length} receipts (accepted=${result.accepted}, rejected=${result.rejected})`);
    } catch (err) {
      if (this.debug) console.error('AgentLedger: Flush failed, re-queuing', err);
      this.queue.unshift(...toSend);
      throw err;
    }
  }

  private parseWwwAuthenticate(header: string): { raw: string; parsed: Record<string, string> } | null {
    try {
      const parts = header.split(',').map(p => p.trim());
      const parsed: Record<string, string> = {};
      for (const part of parts) {
        const eqIdx = part.indexOf('=');
        if (eqIdx === -1) continue;
        const key = part.substring(0, eqIdx).trim().toLowerCase().replace(/-/g, '_');
        let value = part.substring(eqIdx + 1).trim().replace(/^"|"$/g, '');
        if (key === 'error' || key === 'challenge') {
          try {
            const decoded = Buffer.from(value, 'base64').toString('utf8');
            const inner = JSON.parse(decoded);
            Object.assign(parsed, inner);
            parsed['_raw_error_b64'] = value;
            continue;
          } catch { /* not base64 JSON */ }
        }
        parsed[key] = value;
      }
      const raw = Buffer.from(JSON.stringify(parsed)).toString('base64');
      return { raw, parsed };
    } catch { return null; }
  }

  wrapFetch(originalFetch: typeof globalThis.fetch): typeof globalThis.fetch {
    const ledger = this;
    return async function interceptedFetch(input: RequestInfo | URL, init?: RequestInit) {
      const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;
      let response: Response;
      try {
        response = await originalFetch(input, init);
      } catch (err) { throw err; }
      const status = response.status;
      const headers = response.headers;
      if (status === 402) {
        const wwwAuth = headers.get('WWW-Authenticate') || headers.get('www-authenticate');
        if (wwwAuth && wwwAuth.toLowerCase().startsWith('payment')) {
          const parsed = ledger.parseWwwAuthenticate(wwwAuth);
          if (parsed) {
            ledger.pendingChallenges.set(urlStr, { challenge: wwwAuth, challengeRaw: parsed.raw, url: urlStr, timestamp: new Date().toISOString() });
            if (ledger.debug) console.log(`AgentLedger: Captured 402 challenge for ${urlStr}`);
          }
        }
        return response;
      }
      if (status === 200) {
        const mppReceipt = headers.get('Payment-Receipt');
        if (mppReceipt) ledger.submitReceipt({ receipt_raw: mppReceipt, service_url: urlStr, protocol: 'mpp' }, urlStr).catch(() => {});
        const x402Receipt = headers.get('X-Payment-Response') || headers.get('Payment-Response');
        if (x402Receipt) ledger.submitReceipt({ receipt_raw: x402Receipt, service_url: urlStr, protocol: 'x402' }, urlStr).catch(() => {});
      }
      return response;
    } as Response;
  }

  async flushNow(): Promise<void> { await this.flush(); }

  async shutdown(): Promise<void> {
    if (this.flushTimer) clearInterval(this.flushTimer);
    await this.flush();
  }

  getPendingChallengeCount(): number { return this.pendingChallenges.size; }
}
