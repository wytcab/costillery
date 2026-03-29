"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.wrapAxios = wrapAxios;
const client_1 = require("./client");
const types_1 = require("./types");
/**
 * Wrap an Axios instance to auto-capture MPP/x402 payment headers.
 * Handles both 200 receipt headers AND 402 challenge headers.
 */
function wrapAxios(axiosInstance, options) {
    const ledger = new client_1.AgentLedger(options);
    axiosInstance.interceptors.response.use((response) => {
        const headers = response.headers || {};
        const url = response.config?.url || '';
        const mppReceipt = headers['payment-receipt'];
        if (mppReceipt) {
            ledger.submitReceipt({ receipt_raw: mppReceipt, service_url: url, protocol: 'mpp' }, url).catch(() => { });
        }
        const x402Receipt = headers['x-payment-response'] || headers['payment-response'];
        if (x402Receipt) {
            ledger.submitReceipt({ receipt_raw: x402Receipt, service_url: url, protocol: 'x402' }, url).catch(() => { });
        }
        return response;
    }, (error) => Promise.reject(error));
    axiosInstance.interceptors.response.use((response) => response, (error) => {
        const response = error.response;
        if (response && response.status === 402) {
            const wwwAuth = (response.headers || {})['www-authenticate'] || '';
            if (wwwAuth && wwwAuth.toLowerCase().startsWith('payment')) {
                const url = error.config?.url || '';
                const parsed = (0, types_1.parseWwwAuthenticate)(wwwAuth);
                if (parsed) {
                    ledger.submitReceipt({ receipt_raw: '', service_url: url, protocol: 'x402', challenge_raw: parsed.raw }, url).catch(() => { });
                }
            }
        }
        return Promise.reject(error);
    });
    return ledger;
}
