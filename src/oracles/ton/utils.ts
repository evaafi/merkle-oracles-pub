
import { Address, TupleItem } from "@ton/core";
import { ExtendedClient } from "./types";

export async function runMethod(clients: ExtendedClient[], address: Address, name: string, stack?: TupleItem[]) {
    for (const client of clients) {
        try {
            return await client.client.runMethod(address, name, stack);
        } catch (e) {
            console.error(`Failed to run method ${name} on client ${client.name}: ${e}. Switching to the next client...`);
        }
    }

    throw new Error(`Failed to run method ${name} on all clients`);
}