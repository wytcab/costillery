"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseWwwAuthenticate = parseWwwAuthenticate;
// Standalone utility — can be used without importing AgentLedger
function parseWwwAuthenticate(header) {
    try {
        const parts = header.split(',').map(p => p.trim());
        const parsed = {};
        for (const part of parts) {
            const eqIdx = part.indexOf('=');
            if (eqIdx === -1)
                continue;
            const key = part.substring(0, eqIdx).trim().toLowerCase().replace(/-/g, '_');
            let value = part.substring(eqIdx + 1).trim().replace(/^"|"$/g, '');
            if (key === 'error' || key === 'challenge') {
                try {
                    const decoded = Buffer.from(value, 'base64').toString('utf8');
                    Object.assign(parsed, JSON.parse(decoded));
                    parsed._raw_error_b64 = value;
                    continue;
                }
                catch { }
            }
            parsed[key] = value;
        }
        return { raw: Buffer.from(JSON.stringify(parsed)).toString('base64'), parsed };
    }
    catch {
        return null;
    }
}
