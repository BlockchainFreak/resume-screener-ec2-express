import express, { Request, Response } from 'express';
import fs from 'fs';
import multer from "multer";
import path from "path";
import cors from "cors";
import {
    calculateHash, extractTextFromPDF
} from "./lib";
import { getResumeData, createResumeData, updateResumeData } from './utils';
import { EventManager } from "./EventManager";
import { GPTModels, startChain } from './sequentialChain';

if(fs.existsSync("uploads") === false) {
    fs.mkdirSync("uploads");
}

if(fs.existsSync("logs") === false) {
    fs.mkdirSync("logs");
}

if(fs.existsSync("records") === false) {
    fs.mkdirSync("records");
    fs.writeFileSync("records/resumes.json", "{}");
}

if(fs.existsSync("records/resumes.json") === false) {
    fs.writeFileSync("records/resumes.json", "{}");
}

// Set up Multer storage
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, './uploads');
    },
    filename: async (req, file, cb) => {
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
app.use(cors());
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
        const { originalname, path } = file;
        const hash = await calculateHash(path);

        // rename
        fs.renameSync(path, `./uploads/${hash}.pdf`)

        const resume = getResumeData(hash);

        if (resume) {
            if (resume.status === "completed") {
                // Conflict
                res.status(409).json({ message: `${originalname} file has already been processed with hash ${hash}` });
            }
            else if (resume.status === "processing") {
                // Accepted
                res.status(202).json({ message: `${originalname} file is in processing and has already been enqueued with hash ${hash}` });
            }
            return;
        }

        const resume_content = await extractTextFromPDF(`./uploads/${hash}.pdf`);

        // create a db record
        createResumeData({
            id: hash,
            size: file.size,
            name: file.originalname,
            type: file.mimetype,
            status: "processing",
            date: new Date().toISOString(),
            results: "",
        });

        console.log("Starting chain")
        const response = await startChain({ fileHash: hash, resume_content, modelName, eventManager });
        
        updateResumeData(hash, { results: response, status: "completed" })

        res.json({ message: `${originalname} file has been enqueued with hash ${hash}` });
    }
    catch (err: any) {
        console.trace(err);
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
    const resume = getResumeData(id);
    if (!resume) {
        res.status(404).json({ error: "Resume not found" });
        return;
    }
    res.json(resume);
})


app.get("/resume/:id/file", async (req, res) => {
    try {
        const id = req.params.id;
        const content = fs.readFileSync(`./uploads/${id}.pdf`);
        const base64 = content.toString('base64');
        res.json({ base64 });
    }
    catch (err: any) {
        res.status(500).json({ error: JSON.stringify(err) });
    }
});