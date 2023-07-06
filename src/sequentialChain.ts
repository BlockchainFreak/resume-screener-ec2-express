import { SequentialChain, LLMChain } from "langchain/chains";
import { ChatOpenAI } from "langchain/chat_models/openai";
import { PromptTemplate } from "langchain/prompts";
import { Response } from "express";
import { LLMCallbackHandler } from "./callbackHandler";
import { EventManager } from "./EventManager";

export type GPTModels = "gpt-3.5-turbo" | "gpt-3.5-turbo-16k" | "gpt-4"

const config = {
    temperature: 0,
    max_tokens: -1,
    streaming: true,
}

const formatIntoMarkdown = `
###
{resume_content}
###

rewrite this in markdown format.

follow these rules:
valid_headings = (work experience, education, summary, skills, certifications, projects) 
The valid headings should be written as h2 headings. the subheadings could be h3 or below.
any other h2 heading that does not belong to the set of valid_headings should be mapped one of the valid headings.

for example 
"employment" => work experience
"tools and technologies" => skills
`



const processWorkExperience = `
###
{markdown}
###

given a work experience section, let's think step by step about the skill-wise and industry-wise experience and give a brief breakdown.
industry can be healthcare, finance, retail, etc.
similarly skills include programming languages, frameworks, tools, etc.
analyze each industry by the number of years. give the breakdown of years of experience at each company

reponse format:
"""
Company: Company1 (May 2000 - June 2005)
Duration: 5 years and 1 month
Skills: s1, s2, s3
Industry: h1, h2, h3
"""
`

const json_schema = JSON.stringify({
    "Skill Wise Experience": [
        {
            "Skill Name": "<skill name>",
            "Total Experience (in years)": 1,
            "Breakdown": "x years (company a), y years (company b)",
        }
    ],
    "Industry Wise Experience": [
        {
            "Industry Name": "<industry name>",
            "Total Experience (in years)": 3,
            "Breakdown": "x years (company a)",
        }
    ]
})

const TICKS = "```"
const convertToJSONWithSchema = `
"""
{work_experience}
"""

rewrite the following as json object with "Skill Wise Experience" and "Industry Wise Experience" as keys. Both keys are an array of objects (see the format below for more details)

Format of the response:
${TICKS}json
{json_schema}
${TICKS}

Note: the above schema is just an example. The array can have multiple objects but the keys should be the same.
`

type StartChainParams = {
    fileHash: string;
    resume_content: string;
    modelName: GPTModels;
    eventManager: EventManager;
}

const isParseable = (json: string) => {
    try {
        JSON.parse(json)
        return true
    }
    catch (e) { return false }
}

type ParsedResume = {
    "Work Experience": string;
    "Education": string;
    "Skills": string;
    "Summary": string;
    "Projects": string;
    "Certifications": string;
}
const fields = ["Work Experience", "Education", "Skills", "Summary", "Projects", "Certifications"]


export function parseMd(md: string) {
    const rege = /\n##\s/g
    const sections = md.replace(rege, "@@@\n## ").split("@@@\n")
    const parsed = {} as any
    for (const section of sections) {
        const [title, ...content] = section.split("\n")
        parsed[title.replace("## ", "")] = content.join("\n")
    }
    for (const field of fields) {
        parsed[field] = parsed[field] || ""
    }
    return parsed as ParsedResume
}

function trimExtraText(input: string): string {
    const startIndex = input.indexOf('{');
    const endIndex = input.lastIndexOf('}') + 1;
    return input.substring(startIndex, endIndex);
}

export const startChain = async ({ fileHash, resume_content, modelName, eventManager }: StartChainParams) => {

    const createLLMChain = (template: string, inputVariables: string[], outputKey: string, progressIndex: number) => {
        const callbacks = [new LLMCallbackHandler(eventManager, fileHash, progressIndex)]
        const llm = new ChatOpenAI({ ...config, modelName, callbacks })
        const prompt = new PromptTemplate({ template, inputVariables })
        return new LLMChain({ llm, prompt, outputKey })
    }

    const markdownChain = createLLMChain(formatIntoMarkdown, ["resume_content"], "markdown", 1)
    const workExperienceChain = createLLMChain(processWorkExperience, ["markdown"], "work_experience", 2)
    const jsonSchemaChain = createLLMChain(convertToJSONWithSchema, ["work_experience", "json_schema"], "json", 3)

    const resumeChain = new SequentialChain({
        chains: [markdownChain, workExperienceChain, jsonSchemaChain],
        inputVariables: ["resume_content", "json_schema"],
        outputVariables: ["markdown", "work_experience", "json"],
        verbose: true,
    })

    const response = await resumeChain.call({ resume_content, json_schema })

    const json_response = response["json"] as string

    return JSON.stringify(JSON.parse(trimExtraText(json_response)))
}