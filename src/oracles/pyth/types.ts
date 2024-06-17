export type PythPrice = {
    priceId: string,
    isMerkleProofValid: boolean,
    emaPrice: string,
    attestationTime: number,
    publishTime: number,
    price: string,
    expo: number,
    proofs: string[],
    message: string
};

export type PythResponse = {
    binary: {
        data: string[],
        encoding: string
    },
    parsed: {
        ema_price: {
            conf: string,
            expo: number,
            price: string,
            publish_time: number
        },
        id: string,
        metadata: {
            prev_publish_time: number,
            proof_available_time: number,
            slot: number
        },
        price: {
            conf: string,
            expo: number,
            price: string,
            publish_time: number
        }
    }[]
};