import { keccak256 } from 'ethereumjs-util';
import * as keccak from 'keccak';
import { bufferToBigInt, retry, sleep } from '../../utils';
import secp256k1 from "secp256k1";
import { PythPrice, PythResponse } from './types';
import { Bot } from 'grammy';
import { PRICE_TTL_MS, ORACLE_RETRY_COUNT, ORACLE_RETRY_DELAY_MS } from '../../constants';
import { OraclePrices } from '../../types';
import { PYTH_ASSET_ID, guardians } from './constants';

function extractPriceInfoFromAccumulatorUpdate(updateData: Buffer) {
    try {
        let offset = 0;
        offset += 4; // magic
        offset += 1; // major version
        offset += 1; // minor version

        const trailingHeaderSize = updateData.readUint8(offset);
        offset += 1 + trailingHeaderSize;

        const updateType = updateData.readUint8(offset);
        offset += 1;

        if (updateType !== 0) {
            throw new Error(`Invalid accumulator update type: ${updateType}`);
        }

        const vaaLength = updateData.readUint16BE(offset);
        offset += 2;

        const vaaBuffer = updateData.slice(offset, offset + vaaLength);
        const sigStart = 6;
        const numSigners = vaaBuffer[5];
        const sigLength = 66;
        const guardianSignatures = [];
        for (let i = 0; i < numSigners; ++i) {
            const start = sigStart + i * sigLength;
            guardianSignatures.push({
                index: vaaBuffer[start],
                signature: Buffer.from(vaaBuffer.subarray(start + 1, start + 66)).toString("hex"),
            });
        }

        const body = vaaBuffer.subarray(sigStart + sigLength * numSigners);
        const vaaAssertationTime = body.readUint32BE()
        const digest = body.slice(-20);

        offset += vaaLength;

        const numUpdates = updateData.readUint8(offset);
        offset += 1;

        const dataParsed = []
        for (let i = 0; i < numUpdates; i++) {
            const messageLength = updateData.readUint16BE(offset);
            offset += 2;
            const message = updateData.slice(offset, offset + messageLength);
            offset += messageLength;
            const proofLength = updateData.readUint8(offset);
            offset += 1;

            let proofs = [];
            let currentDigest = keccak256(Buffer.concat([Buffer.from([0]), message])).slice(0, 20);
            for (let i = 0; i < proofLength; i++) {
                let sibling = updateData.slice(offset, offset + 20);
                proofs.push(sibling.toString("hex"));
                let a = currentDigest
                let b = sibling
                if (bufferToBigInt(a) > bufferToBigInt(b)) {
                    a = sibling
                    b = currentDigest
                }
                currentDigest = keccak256(Buffer.concat([Buffer.from([1]), a, b])).slice(0, 20);
                offset += 20;
            }

            const isMerkleProofValid = digest.toString("hex") == currentDigest.toString("hex");

            let messageOffset = 0;
            const messageType = message.readUint8(messageOffset);
            messageOffset += 1;

            if (messageType !== 0) {
                continue;
            }

            const priceId = message.slice(messageOffset, messageOffset + 32).toString("hex");
            messageOffset += 32;
            const price = message.readBigInt64BE(messageOffset);
            messageOffset += 8;
            messageOffset += 8;
            const expo = message.readInt32BE(messageOffset);
            messageOffset += 4;
            const publishTime = message.readBigInt64BE(messageOffset);
            messageOffset += 8;
            messageOffset += 8;
            const emaPrice = message.readBigInt64BE(messageOffset);
            messageOffset += 8;
            dataParsed.push({
                priceId,
                isMerkleProofValid,
                emaPrice: emaPrice.toString(),
                attestationTime: Number(vaaAssertationTime),
                publishTime: Number(publishTime),
                price: price.toString(),
                expo,
                proofs,
                message: message.toString("hex"),
            })
        }
        
        return { vaaProof: { guardianSignatures, body: body.toString('hex') }, dataParsed };
    } catch (e) {
        console.error(e);
        throw new Error(`Failed to extract price info from accumulator update: ${e}`);
    }
}

function checksumAddress(address: string) {
    address = address.toLowerCase().replace("0x", "");
    const hash = keccak.default("keccak256").update(address).digest("hex");
    let ret = "0x";
    for (let i = 0; i < address.length; i++) {
        ret += parseInt(hash[i], 16) >= 8
            ? address[i].toUpperCase()
            : address[i];
    }
    return ret;
}

export async function getPythPrices(bot: Bot, prefix: string): Promise<OraclePrices> {
    const result = await retry(async () => {
        const result =  await fetch(`https://hermes.pyth.network/v2/updates/price/latest?ids[]=${PYTH_ASSET_ID.TON}&ids[]=${PYTH_ASSET_ID.USDT}&ids[]=${PYTH_ASSET_ID.USDC}&encoding=base64`);
        if (result.status === 200) {
            return result;
        }
        console.log(result);
        throw new Error(`Failed to fetch Pyth prices: ${result}`);
    }, ORACLE_RETRY_COUNT, ORACLE_RETRY_DELAY_MS, "Load Pyth prices");

    const json = await result.json() as PythResponse;
    const vaa = Buffer.from(json.binary.data[0], 'base64');
    const parsedResult = extractPriceInfoFromAccumulatorUpdate(vaa)
    if (!(parsedResult && parsedResult.dataParsed[0])) {
        console.log('----- JSON -----');
        console.log(json);
        console.log('----- PARSED -----');
        console.log(parsedResult);
        throw new Error("Failed to extract price info from accumulator update");
    }
    
    if (parsedResult.vaaProof.guardianSignatures.length < guardians.length * 2 / 3) {
        console.log('----- Guardian Signatures -----');
        console.log(parsedResult.vaaProof.guardianSignatures);
        throw new Error(`Not enough signatures: ${parsedResult.vaaProof.guardianSignatures.length} out of ${guardians.length}`);
    } 
    
    const body_hash = keccak256(Buffer.from(parsedResult.vaaProof.body, "hex"))
    const messageHash = keccak.default("keccak256").update(body_hash).digest();
    let i = 0;
    let valid = 0;
    
    let success = true;
    while (i < parsedResult.vaaProof.guardianSignatures.length) {
        const recoveryID = Buffer.from(parsedResult.vaaProof.guardianSignatures[i].signature, 'hex')[64] % 2;
        const signature = Buffer.from(parsedResult.vaaProof.guardianSignatures[i].signature, 'hex').slice(0, 64);
        const publicKey = Buffer.from(secp256k1.ecdsaRecover(signature, recoveryID, messageHash, false));
        const publicKeyHash = keccak256(publicKey.slice(1))
        const address = Buffer.from(publicKeyHash).slice(-20).toString("hex");
        const checksummedAddress = checksumAddress(address);
        if (guardians.includes(checksummedAddress)) {
            valid++
        } else {
            console.log(`Invalid signature. Guardian ${checksummedAddress} is not in the list of guardians`);
            console.log(parsedResult.vaaProof.guardianSignatures[i]);
            success = false;
            await bot.api.sendMessage(process.env.TELEGRAM_CHAT_ID, `${prefix} Invalid signature. Guardian ${checksummedAddress} is not in the list of guardians`);
            await sleep(300);
        }
        i++;
    }
    if (!success) {
        console.log(parsedResult.vaaProof);
        console.log(parsedResult);
    }
    if (valid < 13) {
        throw new Error(`Not enough valid signatures: ${valid} out of ${guardians.length}`);
    } 

    let errors = '';

    const tonData = parsedResult.dataParsed.find((e) => e.priceId === PYTH_ASSET_ID.TON) as PythPrice;
    const usdtData = parsedResult.dataParsed.find((e) => e.priceId === PYTH_ASSET_ID.USDT) as PythPrice;
    const usdcData = parsedResult.dataParsed.find((e) => e.priceId === PYTH_ASSET_ID.USDC) as PythPrice;

    if (!tonData) {
        errors += 'TON data not found\n';
    }
    if (!usdtData) {
        errors += 'USDT data not found\n';
    }
    if (!usdcData) {
        errors += 'USDC data not found\n';
    }

    const now = Math.floor(Date.now() / 1000);

    if (now - tonData.publishTime > PRICE_TTL_MS) {
        errors += `TON data is stale. Last publish time: ${tonData.publishTime}\n`;
    }
    if (now - usdtData.publishTime > PRICE_TTL_MS) {
        errors += `USDT data is stale. Last publish time: ${usdtData.publishTime}\n`;
    }
    if (now - usdcData.publishTime > PRICE_TTL_MS) {
        errors += `USDC data is stale. Last publish time: ${usdcData.publishTime}\n`;
    }

    if (errors) {
        await sleep(300);
        throw new Error(errors);
    }

    return {
        TON: Number(tonData.price) * 10 ** tonData.expo,
        USDT: Number(usdtData.price) * 10 ** usdtData.expo,
        USDC: Number(usdcData.price) * 10 ** usdcData.expo
    }
}