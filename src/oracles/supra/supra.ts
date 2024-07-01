import { PullServiceClient } from "./pullServiceClient";
import Web3 from 'web3';
import { SupraPrices } from "./types";
import { CHAIN_TYPE, ORACLE_ADDRESS, PAIR_INDEXES, SUPRA_ASSET_ID, SUPRA_DECIMAL } from "./constants";
import { OraclePrices } from "../../types";
import { PRICE_TTL_MS, ORACLE_RETRY_COUNT, ORACLE_RETRY_DELAY_MS } from "../../constants";
import { Bot } from "grammy";
import { retry, sleep } from "../../utils";

export async function getSupraPrices(bot: Bot, prefix: string): Promise<OraclePrices> {
    const client = new PullServiceClient(ORACLE_ADDRESS);
    const request = {
        pair_indexes: PAIR_INDEXES,
        chain_type: CHAIN_TYPE
    };
    
    try {
        const response: any = await retry(async () => {
            return new Promise((resolve, reject) => {
                client.getProof(request, async (err, response) => {
                    if (err) {
                        console.error('Error:', err.details);
                        reject(err);
                    } else {
                        resolve(response);
                    }
                });
            });
        }, ORACLE_RETRY_COUNT, ORACLE_RETRY_DELAY_MS, 'Get Supra prices');
        const pricesData = await callContract(response.evm);

        let errors = '';

        const now = Date.now();

        if (now - pricesData.TON.timestamp > PRICE_TTL_MS) {
            errors += `TON data is stale. Last publish time: ${pricesData.TON.timestamp}\n`;
        }
        if (now - pricesData.USDT.timestamp > PRICE_TTL_MS) {
            errors += `USDT data is stale. Last publish time: ${pricesData.USDT.timestamp}\n`;
        }
        if (now - pricesData.USDC.timestamp > PRICE_TTL_MS) {
            errors += `USDC data is stale. Last publish time: ${pricesData.USDC.timestamp}\n`;
        }

        if (errors) {
            throw new Error(errors);
        }

        return {
            TON: pricesData.TON.price,
            USDT: pricesData.USDT.price,
            USDC: pricesData.USDC.price,
        }
    } catch (error) {
        await bot.api.sendMessage(process.env.TELEGRAM_CHAT_ID, `${prefix} Failed to get proof or call contract: ${error}`);
        throw error;
    }
}

async function callContract(response): Promise<SupraPrices> {
    const web3 = new Web3(new Web3.providers.HttpProvider(`https://mainnet.infura.io/v3/${process.env.INFURA_API_KEY}`));
    const hex = web3.utils.bytesToHex(response.proof_bytes);
    const OracleProofABI = require("./resources/oracleProof..json");
    const SignedCoherentClusterABI = require("./resources/signedCoherentCluster.json"); 

    let proof_data: any = web3.eth.abi.decodeParameters(OracleProofABI,hex);

    let clusters = proof_data[0].clustersRaw;
    let pairMask = proof_data[0].pairMask;
    let pair = 0; 
    let pairId = [] 
    let pairPrice = [];
    let pairDecimal = [];
    let pairTimestamp = [];

    for (let i = 0; i < clusters.length; ++i) {
      let scc: any = web3.eth.abi.decodeParameters(SignedCoherentClusterABI,clusters[i]);
      
      for (let j = 0; j < scc[0].cc.pair.length; ++j) {
          pair += 1;
          if (!pairMask[pair - 1]) {
              continue;
          }
          pairId.push(scc[0].cc.pair[j].toString(10));
          pairPrice.push(scc[0].cc.prices[j].toString(10));
          pairDecimal.push(scc[0].cc.decimals[j].toString(10));
          pairTimestamp.push(scc[0].cc.timestamp[j].toString(10));
      }
    }

    let prices: SupraPrices = {
        TON: {
            price: 0,
            timestamp: 0
        },
        USDT: {
            price: 0,
            timestamp: 0
        },
        USDC: {
            price: 0,
            timestamp: 0
        },
    };

    for (let i = 0; i < pairId.length; i++) {
        let index = parseInt(pairId[i]);
        let price = BigInt(pairPrice[i]);
        let decimal = parseInt(pairDecimal[i]);
        if (decimal > 9) {
            price = price / (10n ** BigInt(decimal - 9));
        } else {
            price = price * (10n ** BigInt(9 - decimal));
        }
        
        switch (index) {
            case SUPRA_ASSET_ID.TON:
                prices.TON.price = Number(price) / SUPRA_DECIMAL;
                prices.TON.timestamp = pairTimestamp[i];
                break;
            case SUPRA_ASSET_ID.USDT:
                prices.USDT.price = Number(price) / SUPRA_DECIMAL;
                prices.USDT.timestamp = pairTimestamp[i];
                break;
            case SUPRA_ASSET_ID.USDC:
                prices.USDC.price = Number(price) / SUPRA_DECIMAL;
                prices.USDC.timestamp = pairTimestamp[i];
                break;
        }
    }

    return prices;
}