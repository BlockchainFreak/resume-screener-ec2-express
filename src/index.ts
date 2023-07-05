import express, { Request, Response } from 'express';
import multer from "multer";
import path from "path";
import {
    calculateHash, extractTextFromPDF, uploadFileToS3, getFilePresignedUrl,
    getResume, insertResume, updateResume
} from "./lib";
import { EventManager } from "./EventManager";
import { GPTModels, startChain } from './sequentialChain';

// Set up Multer storage
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, './uploads');
    },
    filename: (req, file, cb) => {
        cb(null, file.originalname);
    }
});

// Set up Multer upload
const upload = multer({
    storage: storage,
    fileFilter: (req, file, cb) => {
        // Only allow PDF files
        if (path.extname(file.originalname) !== '.pdf' || file.mimetype !== 'application/pdf') {
            return cb(new Error('Only PDFs are allowed'));
        }
        cb(null, true);
    }
});

const app = express();
const eventManager = new EventManager();

const PORT = 5000
const modelName: GPTModels = "gpt-3.5-turbo-16k"

app.listen(PORT, () => console.log(`Server running on port ${PORT}`))

app.get("/test", (req, res) => {
    res.json({ message: "Hello World" })
});

app.post("/process-resume", upload.single('file'), async (req, res) => {

    let responseSent = false;

    try {
        const file = req.file;
        if (!file) {
            res.status(400).json({ error: "No file uploaded" });
            return;
        }
        const { originalname, path, size, mimetype } = file;

        const hash = await calculateHash(path);

        const resume = await getResume(hash);
        if (resume) {
            if (resume.status === "completed") {
                // Conflict
                res.status(409).json({ message: `${originalname} file has already been processed with hash ${hash}` });
            }
            else if (resume.status === "processing") {
                // Accepted
                res.status(202).json({ message: `${originalname} file has been enqueued with hash ${hash}` });
            }
            return;
        }

        const resume_content = await extractTextFromPDF(path);

        // create a db record
        await insertResume({
            id: hash,
            size: file.size,
            name: file.originalname,
            type: file.mimetype,
            status: "processing",
            date: new Date().toISOString(),
            results: null,
        });

        // upload to s3
        const s3Url = await uploadFileToS3(hash, path);

        res.json({ message: `${originalname} file has been enqueued with hash ${hash}`, url: s3Url });
        responseSent = true;

        const response = await startChain({ fileHash: hash, resume_content, modelName, eventManager });
        console.log(response)
    }
    catch (err: any) {
        if (!responseSent) {
            res.status(500).json({ error: JSON.stringify(err) });
        }
    }
});

app.get("/subscribe", async (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    eventManager.subscribe(res)

    req.on('close', () => {
        eventManager.unsubscribe(res)
    })
})

app.get("/resume/:id", async (req, res) => {
    const id = req.params.id;
    const resume = await getResume(id);
    if (!resume) {
        res.status(404).json({ error: "Resume not found" });
        return;
    }
    res.json(resume);
})

app.get("/resume/:id/url", async (req, res) => {
    try {
        const id = req.params.id;
        const url = await getFilePresignedUrl(id);
        res.json({ url });
    }
    catch (err: any) {
        res.status(500).json({ error: JSON.stringify(err) });
    }
});