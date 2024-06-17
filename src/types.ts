export type OraclePrices = {
    TON: number;
    USDT: number;
    USDC: number;
};

export type PricesToSign = {
    TON: number,
    USDT: number,
    jUSDT: number,
    jUSDC: number,
    stTON: number,
    tsTON: number,
};

export type DataToPush = {
    status: 'ok' | 'error';
    timestamp: number,
    packedPrices: string;
    signature: string;
    assets: string[];
    publicKey: string;
};