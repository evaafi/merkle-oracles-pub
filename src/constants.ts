import { sha256Hash } from "./utils";

export const PRICE_TTL_MS = 30 * 1000;
export const ORACLE_RETRY_COUNT = 3;
export const ORACLE_RETRY_DELAY_MS = 1000;
export const RPC_RETRY_COUNT = 2;
export const RPC_RETRY_DELAY_MS = 1000;

export const ASSETS_ID = {
    TON: sha256Hash('TON'),
    jUSDT: sha256Hash('jUSDT'),
    jUSDC: sha256Hash('jUSDC'),
    stTON: sha256Hash('stTON'),
    tsTON: sha256Hash('tsTON'),
    USDT: sha256Hash('USDT'),
};