import { Response } from "express";
import fs from "fs";

export type Events = {
    fileHash: string,
    eventType: "data" | "progress" | "cache",
    data: string,
}

export type Cache = {
    progress: number,
    data: string,
}

export class EventManager {
    private subscribers: Response[] = [];
    private cache: Record<string, Cache> = {};

    subscribe(res: Response) {
        this.subscribers.push(res);
        // sent cache
        Object.keys(this.cache).forEach(fileHash => {
            const { progress, data } = this.cache[fileHash];
            res.write(`data: ${JSON.stringify({ fileHash, eventType: "cache", data: data })}\n\n`);
        })
        fs.appendFile('logs/connections.log', `[${new Date().toLocaleString()}]: subscribed\n\n`, () => {})
    }

    unsubscribe(res: Response) {
        this.subscribers = this.subscribers.filter(subscriber => subscriber !== res);
        fs.appendFile('logs/connections.log', `[${new Date().toLocaleString()}]: unsubscribed\n\n`, () => {})
    }

    publish(event: Events) {
        this.subscribers.forEach(subscriber => {
            subscriber.write(`data: ${JSON.stringify(event)}\n\n`);
        })

        try {
            // async logs to file
            const timestamp = new Date().toLocaleString();
            fs.appendFile(`logs/${event.fileHash}.log`, `[${timestamp}]\ndata: ${JSON.stringify(event, null, 2)}\n\n`, () => {})
        }
        catch(err) {
            console.error(err);
        }

        if(event.eventType === "progress") {
            const { fileHash } = event;
            this.cache[fileHash] = {
                progress: parseInt(event.data),
                data: this.cache[fileHash]?.data || ""
            }
        }
        if(event.eventType === "data") {
            const { fileHash } = event;
            this.cache[fileHash] = {
                progress: this.cache[fileHash]?.progress || 0,
                data: this.cache[fileHash]?.data + event.data
            }
        }
    }

    removeCache(fileHash: string) {
        delete this.cache[fileHash];
    }
}