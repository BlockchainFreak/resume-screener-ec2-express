import { createReadStream } from 'fs';
import { sha3_256 } from 'js-sha3';
import { PDFLoader } from "langchain/document_loaders/fs/pdf";
import { drizzle } from "drizzle-orm/planetscale-serverless";
import { eq } from "drizzle-orm";
import { ResumeDataSchemaDB, ResumeDataDB, NewResumeDataDB } from './schema';
// import { connection } from './planetscale.js';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import fs from 'fs';
import dotenv from 'dotenv';
dotenv.config();

export const calculateHash = (path: string) => {
    return new Promise<string>((resolve, reject) => {
        const stream = createReadStream(path);
        let chunks = [] as any[];

        stream.on('data', (chunk) => {
            chunks.push(chunk);
        });

        stream.on('end', () => {
            let buffer = Buffer.concat(chunks);
            let arrayBuffer = Uint8Array.from(buffer).buffer;
            let hash = sha3_256(arrayBuffer);
            resolve(hash);
        });

        stream.on('error', (err) => {
            reject(`Error reading file: ${err}`);
        });
    })
}

export const extractTextFromPDF = async (path: string) => {
    const loader = new PDFLoader(path, { splitPages: false });
    const docs = await loader.load();
    return docs[0].pageContent; // pages are not split so there the whole document is in docs[0]
}

export const db_init = async () => {
    // create the connection
    const { connect } = await import("@planetscale/database");
    const connection = connect({
        host: process.env["DATABASE_HOST"],
        username: process.env["DATABASE_USERNAME"],
        password: process.env["DATABASE_PASSWORD"],
    });
    return drizzle(connection);
}

export const BUCKET_NAME = process.env["BUCKET_NAME"] ?? ""

export const s3_init = () => {
    const s3 = new S3Client({ region: "ap-south-1" });
    return s3;
}

export const uploadFileToS3 = async (key: string, path: string) => {
    const s3 = s3_init();
    const fileContent = fs.readFileSync(path);
    const params = {
        Bucket: BUCKET_NAME,
        Key: key,
        Body: fileContent,
    }
    const data = await s3.send(new PutObjectCommand(params));
    console.log(data)
    console.log(`File with [key: ${key}] uploaded successfully`);
}

export const getFilePresignedUrl = async (key: string) => {
    const s3 = s3_init();
    const params = {
        Bucket: BUCKET_NAME,
        Key: key,
    };

    const command = new PutObjectCommand(params)
    const url = await getSignedUrl(s3, command, { expiresIn: 2 * 3600 })
    console.log(`File presigned url: ${url}`);
    return url;
}

export const insertResume = async (data: NewResumeDataDB) => {
    const db = await db_init();
    const item = await db.insert(ResumeDataSchemaDB).values(data).execute();
    return item;
}

export const updateResume = async (fileHash: string, data: Partial<NewResumeDataDB>) => {
    const db = await db_init();
    const item = await db.update(ResumeDataSchemaDB).set(data).where(eq(ResumeDataSchemaDB.id, fileHash)).execute();
    return item;
}

export const getResume = async (fileHash: string) => {
    const db = await db_init();
    const resumes = await db.select().from(ResumeDataSchemaDB).where(eq(ResumeDataSchemaDB.id, fileHash)) as ResumeDataDB[]
    return resumes[0];
}