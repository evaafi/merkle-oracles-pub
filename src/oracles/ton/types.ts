import { TonClient } from "@ton/ton"

export type ExtendedClient = {
    name: string,
    client: TonClient
};