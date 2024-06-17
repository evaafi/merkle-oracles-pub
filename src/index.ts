import { Bot } from "grammy";
import { configDotenv } from "dotenv";
import { getRedstonePrices } from "./oracles/redstone";
import { getPythPrices } from "./oracles/pyth";
import { getSupraPrices } from "./oracles/supra";
import { ExtendedClient } from "./oracles/ton/types";
import { Dictionary, TonClient, toNano } from "@ton/ton";
import { loadStTonPrice } from "./oracles/ton/stton";
import { DataToPush, PricesToSign } from "./types";
import { deleteLogFiles, findMedian, sleep } from "./utils";
import { loadTsTonPrice } from "./oracles/ton/tston";
import { WalletService } from "./pushers/iota";
import path from 'path';
import { mnemonicToWalletKey } from "@ton/crypto";
import { ASSETS_ID } from "./constants";
import { OracleFull, OraclePricesData, Verifier } from "./wrappers/Verifier";

async function main() {
    configDotenv();
    const oracleKeys = await mnemonicToWalletKey(process.env.ORACLE_MNEMONIC.split(' '));
    const oracle: OracleFull = {
        id: parseInt(process.env.ORACLE_ID),
        pubkey: oracleKeys.publicKey,
        secret: oracleKeys.secretKey
    };
    const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN);
    const iotaWalletService = new WalletService(process.env.SERVICE_ALIAS, path.join(__dirname, 'wallet'));
    await iotaWalletService.initAccount();
    await iotaWalletService.destroyWallet();
    await iotaWalletService.initAccount();

    const [RPC_NAMES, RPC_ENDPOINTS, RPC_API_KEYS] = [
        process.env.RPC_NAMES.split(','),
        process.env.RPC_ENDPOINTS.split(','),
        process.env.RPC_API_KEYS.split(',')
    ];
    if (RPC_NAMES.length !== RPC_ENDPOINTS.length || RPC_NAMES.length !== RPC_API_KEYS.length) {
        throw new Error('RPC_NAMES, RPC_ENDPOINTS, RPC_API_KEYS should have the same length');
    }
    const clients: ExtendedClient[] = [];
    for (let i = 0; i < RPC_NAMES.length; i++) {
        clients.push({
            name: RPC_NAMES[i],
            client: new TonClient({
                endpoint: RPC_ENDPOINTS[i],
                apiKey: RPC_API_KEYS[i]
            })
        });
    }

    // these lines are for minting NFT at first time
    // const prices: DataToPush = {"status":"ok","timestamp":1718226090,"packedPrices":"b5ee9c7241020c01000114000109666a0caac001020120020702012003060201200405004dbf748433fcbcc1ac75e54798fb9cdfd8d368b8d6ae3092f4c291cf8465590f7b14a036aeab33b0004dbf6627c5eaf750e15e689006a18f136130fa2b6874a62e57f9c529bc43cfae49cea0385af0a930004dbf895668e908644f30322b997de8faaafc21f05aa52f8982f042dac1fe0b4d09d0501c5b676d58020120080b020120090a004bbf47b22d8d0a21004209a3eeb54d9c61d63c8ef5dbc1a701ddc4311c1cacb03f8c87733a1cd0004bbf670f2d046c32f2b194958abd36b7c71cd118ec635f0990ceac863e9350f1de668772e599d0004bbf8a9006bd3fb03d355daeeff93b24be90afaa6e3ca0073ff5720f8a852c93327843b972cce8a3b24289","signature":"c83003e58a3cb074cdee70d61f7a71e1ac1cd15e84de0d41da77f53ce913a507f770f3c5f3a658cfaba41cddd2520968812664b6b858a7a12ed7623766be7d04","assets":["11876925370864614464799087627157805050745321306404563164673853337929163193738","91621667903763073563570557639433445791506232618002614896981036659302854767224","81203563022592193867903899252711112850180680126331353892172221352147647262515","59636546167967198470134647008558085436004969028957957410318094280110082891718","33171510858320790266247832496974106978700190498800858393089426423762035476944","23103091784861387372100043848078515239542568751939923972799733728526040769767"],"publicKey":"1f9010e120564c457c243efa02583081dea1d76f5a9a2aa04f631e532b647889"};
    // await iotaWalletService.updateNftOutput(prices, true);
    // return;

    let counter = 0;
    const tick = async () => {
        try {
            await handlePrices(bot, clients, iotaWalletService, oracle);
            counter++;
            if (counter == 10) {
                await iotaWalletService.destroyWallet();
                deleteLogFiles(path.join(__dirname, 'wallet/db'));
                await iotaWalletService.initAccount();
                counter = 0;
            }
        } catch (error) {
            console.error(error);
            bot.api.sendMessage(process.env.TELEGRAM_CHAT_ID, 'Unexpected error. Check logs for details.');
        }
        
        setTimeout(tick, 1000);
    }

    tick();
} 

async function handlePrices(bot: Bot, clients: ExtendedClient[], iotaWalletService: WalletService, oracle: OracleFull) {
    console.log(`[${new Date().toISOString()}] Processing prices...`);
    let aggregatedPrices = {
        TON: [],
        USDT: [],
        USDC: []
    };

    let promises = [];
    promises.push((async () => {
        try {
            const pythPrices = await getPythPrices(bot, '[Pyth]');
            for (const [key, value] of Object.entries(pythPrices)) {
                aggregatedPrices[key].push(value);
            }
        } catch (error) {
            console.error(error);
            bot.api.sendMessage(process.env.TELEGRAM_CHAT_ID, 'Failed to get Pyth prices. Skipping...')
                .catch((error) => console.error(error));
        }
    })());
    promises.push((async () => {
        try {
            const redstonePrices = await getRedstonePrices(bot, '[Redstone]');
            for (const [key, value] of Object.entries(redstonePrices)) {
                aggregatedPrices[key].push(value);
            }
        } catch (error) {
            console.error(error);
            bot.api.sendMessage(process.env.TELEGRAM_CHAT_ID, 'Failed to get Redstone prices. Skipping...')
                .catch((error) => console.error(error));
        }
    })());
    promises.push((async () => {
        try {
            const supraPrices = await getSupraPrices(bot, '[Supra]');
            for (const [key, value] of Object.entries(supraPrices)) {
                aggregatedPrices[key].push(value);
            }
        } catch (error) {
            console.error(error);
            bot.api.sendMessage(process.env.TELEGRAM_CHAT_ID, 'Failed to get Supra prices. Skipping...')
                .catch((error) => console.error(error));
        }
    })());
    await Promise.all(promises);

    let pricesToSign: PricesToSign = {
        TON: findMedian(aggregatedPrices.TON),
        USDT: findMedian(aggregatedPrices.USDT),
        jUSDT: findMedian(aggregatedPrices.USDT),
        jUSDC: findMedian(aggregatedPrices.USDC),
        stTON: undefined,
        tsTON: undefined,
    };

    promises = [];
    promises.push((async () => {
        try {
            pricesToSign.stTON = await loadStTonPrice(clients, pricesToSign.TON);
        } catch (error) {
            console.error(error);
            bot.api.sendMessage(process.env.TELEGRAM_CHAT_ID, 'Failed to load stTON price. Skipping...')
                .catch((error) => console.error(error));
        }
    })());
    promises.push((async () => {
        try {
            pricesToSign.tsTON = await loadTsTonPrice(clients, pricesToSign.TON);
        } catch (error) {
            console.error(error);
            bot.api.sendMessage(process.env.TELEGRAM_CHAT_ID, 'Failed to load tsTON price. Skipping...')
                .catch((error) => console.error(error));
        }
    })());
    await Promise.all(promises);

    console.log('----- Aggregated Prices -----');
    console.log(aggregatedPrices);
    console.log('----- Prices to Sign -----');
    console.log(pricesToSign);

    const pricesDict = Dictionary.empty<bigint, bigint>();
    const assets: bigint[] = [];
    for (const [key, value] of Object.entries(pricesToSign)) {
        if (pricesToSign[key] === undefined) {
            bot.api.sendMessage(process.env.TELEGRAM_CHAT_ID, `Price for ${key} is undefined. Skipping...`)
                .catch((error) => console.error(error));
            continue;
        }
        pricesDict.set(ASSETS_ID[key], toNano(value));
        assets.push(ASSETS_ID[key]);
    }

    const oraclePriceData: OraclePricesData = {
        timestamp: Math.floor(Date.now() / 1000),
        prices: pricesDict
    };
    const signedData = Verifier.signPricesData(oracle, oraclePriceData);
    const dataToPush: DataToPush = {
        status: 'ok',
        timestamp: oraclePriceData.timestamp,
        packedPrices: signedData.packedData.toBoc().toString('hex'),
        signature: signedData.signature.toString('hex'),
        assets: assets.map((asset) => asset.toString()),
        publicKey: oracle.pubkey.toString('hex')
    };
    console.log(`Timestamp: ${dataToPush.timestamp}`);
    await iotaWalletService.updateNftOutput(dataToPush);
    console.log(`[${new Date().toISOString()}] Prices processed successfully`);
}

main();
