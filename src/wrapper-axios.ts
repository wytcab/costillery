import { AgentLedger } from './client.js';
import type { AgentLedgerOptions } from './types.js';

/**
 * Wrap an Axios instance to auto-capture MPP/x402 payment headers.
 * Handles both 200 receipt headers AND 402 challenge headers.
 */
export function wrapAxios(axiosInstance: any, options: AgentLedgerOptions): AgentLedger {
  const ledger = new AgentLedger(options);

  axiosInstance.interceptors.response.use(
    (response: any) => {
      const headers = response.headers || {};
      const url = response.config?.url || '';
      const mppReceipt = headers['payment-receipt'];
      if (mppReceipt) {
        ledger.submitReceipt({ receipt_raw: mppReceipt, service_url: url, protocol: 'mpp' }, url).catch(() => {});
      }
      const x402Receipt = headers['x-payment-response'] || headers['payment-response'];
      if (x402Receipt) {
        ledger.submitReceipt({ receipt_raw: x402Receipt, service_url: url, protocol: 'x402' }, url).catch(() => {});
      }
      return response;
    },
    (error: any) => Promise.reject(error)
  );

  axiosInstance.interceptors.response.use(
    (response: any) => response,
    (error: any) => {
      const response = error.response;
      if (response && response.status === 402) {
        const wwwAuth = (response.headers || {})['www-authenticate'] || '';
        if (wwwAuth && wwwAuth.toLowerCase().startsWith('payment')) {
          const url = error.config?.url || '';
          const parsed = parseWwwAuthenticate(wwwAuth);
          if (parsed) {
            ledger.submitReceipt({ receipt_raw: '', service_url: url, protocol: 'x402', challenge_raw: parsed.raw }, url).catch(() => {});
          }
        }
      }
      return Promise.reject(error);
    }
  );

  return ledger;
}

function parseWwwAuthenticate(header: string): { raw: string; parsed: Record<string, string> } | null {
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
