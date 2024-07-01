import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {Bot} from "grammy";

export function findMedian(arr: number[]): number {
    const sortedArr = arr.slice().sort((a, b) => a - b);
    const midIndex = Math.floor(sortedArr.length / 2);

    if (sortedArr.length % 2 === 0) {
        return (sortedArr[midIndex - 1] + sortedArr[midIndex]) / 2;
    } else {
        return sortedArr[midIndex];
    }
}

export const bufferToBigInt = (buf: Buffer) => {
  return BigInt(`0x${buf.toString("hex")}`);
}

export async function retry<T>(
    fn: () => Promise<T>,
    attempts: number,
    timeout: number,
    title: string
): Promise<T> {
    let lastError = null;

    for (let i = 0; i < attempts; i++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;
            console.log(`[${title}] Attempt ${i + 1} failed. Retrying in ${timeout}ms...`);
            await sleep(timeout);
        }
    }

    throw lastError;
}

export function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export function deleteLogFiles(dir: string) {
    try {
        const files: string[] = fs.readdirSync(dir);

        for (const file of files) {
            const filePath: string = path.join(dir, file);
            const stat = fs.statSync(filePath);

            if (stat.isDirectory()) {
                deleteLogFiles(filePath);
            } else {
                if (path.extname(file) === '.log' || /^LOG\.old\.\d+$/.test(file)) {
                    fs.unlinkSync(filePath);
                    console.log(`Deleted log file: ${filePath}`);
                }
            }
        }
    } catch (error) {
        console.error(`An error occurred: ${error.message}`);
    }
}

export function sha256Hash(input: string): bigint {
    const hash = crypto.createHash('sha256');
    hash.update(input);
    return BigInt(`0x${hash.digest('hex')}`);
}

export async function sendIgnoreError(bot: Bot, chatId: string, message: string) {
    try {
        await bot.api.sendMessage(chatId, message);
    } catch (error) {
        console.error(error);
    }
}