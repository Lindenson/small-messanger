import {type IDBPDatabase, openDB} from 'idb';
import {DB_NAME, DB_VERSION, STORE_KEY, STORE_NAME} from "@/shared/config/idb";
import type {OutboxState} from "@/features/chat/model/types";


type ChatDB = { outbox: OutboxState };
let dbPromise: Promise<IDBPDatabase<ChatDB>> | null = null;


export const initDB = async () => {
    if (!dbPromise) {
        dbPromise = openDB(DB_NAME, DB_VERSION, {
            upgrade(db) {
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME);
                }
            },
        });
    }
    return dbPromise;
};

export async function saveOutboxToDB(data: OutboxState) {
    const db = await initDB();
    await db.put(STORE_NAME, data, STORE_KEY);
}

export async function loadOutboxFromDB(): Promise<OutboxState | null> {
    const db = await initDB();
    const result = await db.get(STORE_NAME, STORE_KEY);
    return result ?? null;
}
