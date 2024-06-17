import { RPC_RETRY_COUNT, RPC_RETRY_DELAY_MS } from "../../constants";
import { retry } from "../../utils";
import { PRICE_SCALE_BIGINT, STTON_ADDRESS } from "./constants";
import { ExtendedClient } from "./types";
import { runMethod } from "./utils";

export async function loadStTonPrice(clients: ExtendedClient[], tonPrice: number): Promise<number> {
    const result = await retry(async () => await runMethod(clients, STTON_ADDRESS, 'get_full_data'), 
        RPC_RETRY_COUNT, RPC_RETRY_DELAY_MS, 'Load stTON price');
    const stTONBalance = result.stack.readBigNumber();
    const tonBalance = result.stack.readBigNumber();
    const ratio = tonBalance * PRICE_SCALE_BIGINT / stTONBalance;
    const price = BigInt(Math.round(tonPrice * 1e9)) * ratio / PRICE_SCALE_BIGINT;
    return Number(price) / 1e9;
}