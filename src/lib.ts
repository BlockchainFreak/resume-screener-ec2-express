import { createReadStream } from 'fs';
import { sha3_256 } from 'js-sha3';
import { PDFLoader } from "langchain/document_loaders/fs/pdf";
import { drizzle } from "drizzle-orm/planetscale-serverless";
import { connect } from "@planetscale/database";
import { eq } from "drizzle-orm";
import { ResumeDataSchemaDB, ResumeDataDB, NewResumeDataDB } from './schema';
import { S3 } from 'aws-sdk';
import fs from 'fs';
import dotenv from 'dotenv';
dotenv.config();
console.log({
    host: process.env["DATABASE_HOST"],
    username: process.env["DATABASE_USERNAME"],
    password: process.env["DATABASE_PASSWORD"],
})

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
            console.log(arrayBuffer);
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

// create the connection
const connection = connect({
    host: process.env["DATABASE_HOST"],
    username: process.env["DATABASE_USERNAME"],
    password: process.env["DATABASE_PASSWORD"],
});

export const db_init = () => drizzle(connection);

export const BUCKET_NAME = process.env["BUCKET_NAME"] ?? ""

export const s3_init = () => {
    const s3 = new S3({
        accessKeyId: process.env["AWS_ACCESS_KEY_ID"] ?? "",
        secretAccessKey: process.env["AWS_SECRET_ACCESS_KEY"] ?? "",
    });
    return s3;
}

export const uploadFileToS3 = async (key: string, path: string) => {
    const s3 = s3_init();
    const fileContent = fs.readFileSync(path);
    const response = await s3.upload({
        Bucket: BUCKET_NAME,
        Key: key,
        Body: fileContent,
    }).promise();

    console.log(`File uploaded successfully at ${response.Location}`);

    return response.Location;
}

export const getFilePresignedUrl = async (key: string) => {
    const s3 = s3_init();
    const params = {
        Bucket: BUCKET_NAME,
        Key: key,
        Expires: 60 * 60 * 24, // 24 hours
    };

    const url = await s3.getSignedUrlPromise('getObject', params);
    console.log(`File presigned url: ${url}`);

    return url;
}

export const insertResume = async (data: NewResumeDataDB) => {
    const db = db_init();
    const item = await db.insert(ResumeDataSchemaDB).values(data).execute();
    return item;
}

export const updateResume = async (fileHash: string, data: Partial<NewResumeDataDB>) => {
    const db = db_init();
    const item = await db.update(ResumeDataSchemaDB).set(data).where(eq(ResumeDataSchemaDB.id, fileHash)).execute();
    return item;
}

export const getResume = async (fileHash: string) => {
    const db = db_init();
    const resumes = await db.select().from(ResumeDataSchemaDB).where(eq(ResumeDataSchemaDB.id, fileHash)) as ResumeDataDB[]
    return resumes[0];
}