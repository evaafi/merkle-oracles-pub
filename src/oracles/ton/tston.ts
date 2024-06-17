import { RPC_RETRY_COUNT, RPC_RETRY_DELAY_MS } from "../../constants";
import { retry } from "../../utils";
import { PRICE_SCALE_BIGINT, STTON_ADDRESS, TSTON_ADDRESS } from "./constants";
import { ExtendedClient } from "./types";
import { runMethod } from "./utils";

export async function loadTsTonPrice(clients: ExtendedClient[], tonPrice: number): Promise<number> {
    const result = await retry(async () => await runMethod(clients, TSTON_ADDRESS, 'get_pool_full_data'), 
        RPC_RETRY_COUNT, RPC_RETRY_DELAY_MS, 'Load tsTON price');
    result.stack.skip(28);
    const tonBalance = result.stack.readBigNumber();
    const tsTonBalance = result.stack.readBigNumber();
    const ratio = tonBalance * PRICE_SCALE_BIGINT / tsTonBalance;
    const price = BigInt(Math.round(tonPrice * 1e9)) * ratio / PRICE_SCALE_BIGINT;
    return Number(price) / 1e9; 
}