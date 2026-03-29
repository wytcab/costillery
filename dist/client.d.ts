import { ReceiptPayload, AgentLedgerOptions, SubmitReceiptResponse } from './types';
export { AgentLedgerOptions, ReceiptPayload, SubmitReceiptResponse } from './types';
export declare class AgentLedger {
    private apiKey;
    private endpoint;
    private projectTag?;
    private departmentTag?;
    private queue;
    private batchSize;
    private batchIntervalMs;
    private maxQueueSize;
    private flushTimer?;
    private debug;
    private pendingChallenges;
    constructor(options: AgentLedgerOptions);
    private startFlushTimer;
    private buildPayload;
    submitReceipt(receipt: Partial<ReceiptPayload>, urlStr?: string): Promise<void>;
    submitBatch(receipts: ReceiptPayload[]): Promise<SubmitReceiptResponse>;
    private flush;
    /**
     * Parse a WWW-Authenticate: Payment header value into base64-encoded JSON.
     * Format: Payment realm="...", x402-version="1", algorithm="...", payto="...",
     *         max-amount="...", expires="...", salt="...", ...
     *         OR: Payment x402-version=2, network=..., payto=..., max-amount=...
     *
     * We extract the key fields and encode as base64 JSON for storage.
     */
    private parseWwwAuthenticate;
    /** Wrap global fetch to auto-capture MPP and x402 payment headers */
    wrapFetch(originalFetch: typeof globalThis.fetch): typeof globalThis.fetch;
    flushNow(): Promise<void>;
    shutdown(): Promise<void>;
    /** Expose pending challenge count (useful for debugging) */
    getPendingChallengeCount(): number;
}
