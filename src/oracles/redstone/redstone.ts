import { getDataServiceIdForSigner, getOracleRegistryState, requestDataPackages } from "@redstone-finance/sdk";
import { hexlify } from "ethers";
import { findMedian, retry, sleep } from "../../utils";
import { OraclePrices } from "../../types";
import { Bot } from "grammy";
import { PRICE_TTL_MS, ORACLE_RETRY_COUNT, ORACLE_RETRY_DELAY_MS } from "../../constants";
import { DATA_FEEDS, DATA_SERVICE_ID, REDSTONE_DECIMAL, GATEWAY_URLS, MAX_TIMESTAMP_DEVIATION_MS, UNIQUE_SIGNERS_COUNT } from "./constants";

export async function getRedstonePrices(bot: Bot, prefix: string): Promise<OraclePrices> {
    const [oracleStateWithSigners, dataPackagesResponse] = await retry(async () => {
        const oracleStateWithSigners = await getOracleRegistryState();
        const dataPackagesResponse = await requestDataPackages({
            dataFeeds: DATA_FEEDS,
            dataServiceId: DATA_SERVICE_ID,
            uniqueSignersCount: UNIQUE_SIGNERS_COUNT,
            urls: GATEWAY_URLS,
            maxTimestampDeviationMS: MAX_TIMESTAMP_DEVIATION_MS
        });
        return [oracleStateWithSigners, dataPackagesResponse];
    }, ORACLE_RETRY_COUNT, ORACLE_RETRY_DELAY_MS, 'Load Redstone Prices');

    let prices = {
        TON: [],
        USDT: [],
        USDC: []
    };
    const now = Date.now();
    for (const [dataFeedId, dataPackages] of Object.entries(dataPackagesResponse)) {
        for (const signedDataPackage of dataPackages) {
            if (now - signedDataPackage.dataPackage.timestampMilliseconds > PRICE_TTL_MS) {
                console.log(signedDataPackage);
                await bot.api.sendMessage(process.env.TELEGRAM_CHAT_ID, `${prefix} Detected stale price data package for ${dataFeedId}. Timestamp: ${signedDataPackage.dataPackage.timestampMilliseconds}`);
                throw new Error(`Stale price data package for ${dataFeedId}`);
            }
            const signerAddress = signedDataPackage.recoverSignerAddress();
            const dataServiceBySigner = getDataServiceIdForSigner(
                oracleStateWithSigners,
                signerAddress
            );
            if (dataServiceBySigner !== DATA_SERVICE_ID) {
                console.log(signedDataPackage);
                await bot.api.sendMessage(process.env.TELEGRAM_CHAT_ID, `${prefix} Invalid data service id for signer ${signerAddress}`);
                throw new Error(`Invalid data service id for signer ${signerAddress}`);
            }

            const valueBytes = signedDataPackage.dataPackage.dataPoints[0].value;
            const valueAsBigNumber = BigInt(hexlify(valueBytes));

            switch (dataFeedId) {
                case "TON":
                    prices.TON.push(Number(valueAsBigNumber) / REDSTONE_DECIMAL);
                    break;
                case "USDT":
                    prices.USDT.push(Number(valueAsBigNumber) / REDSTONE_DECIMAL);
                    break;
                case "USDC":
                    prices.USDC.push(Number(valueAsBigNumber) / REDSTONE_DECIMAL);
                    break;
            }
        }
    }

    return {
        TON: findMedian(prices.TON),
        USDT: findMedian(prices.USDT),
        USDC: findMedian(prices.USDC)
    };
}