import { BaseCallbackHandler, NewTokenIndices } from "langchain/callbacks";
import { Serialized } from "langchain/load/serializable";
import { AgentAction, AgentFinish, ChainValues, LLMResult } from "langchain/schema";
import { EventManager } from "./EventManager";

// This is the max batch size for the tokens to be sent to the client
const MAX_BATCH_SIZE = 40;

export class LLMCallbackHandler extends BaseCallbackHandler {
    name = "LLMCallbackHandler"
    fileHash: string = "";
    progressIndex: number = 1;
    eventManager: EventManager | null = null;
    batch: string[] = Array(MAX_BATCH_SIZE).fill("");
    batchSize: number = 0;

    sendBatch() {
        if(this.eventManager && this.batchSize > 0) {
            const data = this.batch.join("")
            this.batch = Array(MAX_BATCH_SIZE).fill("")
            this.batchSize = 0;

            this.eventManager.publish({
                fileHash: this.fileHash,
                eventType: "data",
                data
            })
        }
    }

    constructor(eventManager: EventManager, fileHash: string, progressIndex: number) {
        super();
        this.eventManager = eventManager;
        this.fileHash = fileHash;
        this.progressIndex = progressIndex;
    }

    async handleLLMNewToken(token: string, idx: NewTokenIndices, runId: string, parentRunId?: string | undefined) {
        this.batch[this.batchSize] = token;
        ++this.batchSize;
        if(this.batchSize === MAX_BATCH_SIZE) {
            this.sendBatch();
        }
    }

    async handleLLMEnd(output: LLMResult, runId: string, parentRunId?: string | undefined) {
        if(this.eventManager) {
            this.eventManager.publish({
                fileHash: this.fileHash,
                eventType: "progress",
                data: this.progressIndex.toString()
            })
        }
        this.sendBatch();
    }
}