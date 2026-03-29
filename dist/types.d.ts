export interface ReceiptPayload {
    receipt_raw?: string;
    challenge_raw?: string;
    service_url?: string;
    amount?: string;
    currency?: string;
    protocol?: string;
    agent_label?: string;
    metadata?: Record<string, any>;
    date?: string;
}
export interface AgentLedgerOptions {
    apiKey: string;
    endpoint?: string;
    projectTag?: string;
    departmentTag?: string;
    batchSize?: number;
    batchIntervalMs?: number;
    maxQueueSize?: number;
    debug?: boolean;
}
export interface SubmitReceiptResponse {
    accepted: number;
    rejected: number;
    receipt_ids: string[];
    rejection_reasons?: {
        reason: string;
    }[];
}
export declare function parseWwwAuthenticate(header: string): {
    raw: string;
    parsed: Record<string, string>;
} | null;
