import { ResumeDataDB } from "./schema";
import { readFileSync, writeFileSync } from "fs";

export const getResumeData = (id: string) => {
    const content = readFileSync("records/resumes.json", "utf-8");
    const data = JSON.parse(content) as Record<string, ResumeDataDB>;
    return data[id];
}

export const createResumeData = (data: ResumeDataDB) => {
    const content = readFileSync("records/resumes.json", "utf-8");
    const records = JSON.parse(content) as Record<string, ResumeDataDB>;
    records[data.id] = data;
    writeFileSync("records/resumes.json", JSON.stringify(records, null, 2));
}

export const updateResumeData = (id: string, data: Partial<ResumeDataDB>) => {
    const content = readFileSync("records/resumes.json", "utf-8");
    const records = JSON.parse(content) as Record<string, ResumeDataDB>;
    records[id] = { ...records[id], ...data };
    writeFileSync("records/resumes.json", JSON.stringify(records, null, 2));
}

export const deleteResumeData = (id: string) => {
    const content = readFileSync("records/resumes.json", "utf-8");
    const records = JSON.parse(content) as Record<string, ResumeDataDB>;
    delete records[id];
    writeFileSync("records/resumes.json", JSON.stringify(records, null, 2));
}