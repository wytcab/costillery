import { AgentLedger } from './client';
import type { AgentLedgerOptions } from './types';
/**
 * Wrap an Axios instance to auto-capture MPP/x402 payment headers.
 * Handles both 200 receipt headers AND 402 challenge headers.
 */
export declare function wrapAxios(axiosInstance: any, options: AgentLedgerOptions): AgentLedger;
