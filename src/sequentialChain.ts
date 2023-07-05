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
            "Skill Name": "s1",
            "Total Experience (in years)": 0,
            "Breakdown": "x years (company a), y years (company b)",
        }
    ],
    "Industry Wise Experience": [
        {
            "Industry Name": "h1",
            "Total Experience (in years)": 0,
            "Breakdown": "x years (company a)",
        }
    ]
})

const convertToJSONWithSchema = `
###
{work_experience}
###

The schema of JSON object is as follows:
"""{json_schema}"""
convert this into JSON object with no indentation. There should be no indentation in the response JSON.
convert this into JSON object with no indentation. There should be no indentation in the response JSON.
Important: your response should be parsable by JSON.parse() function.
`

type StartChainParams = {
    fileHash: string;
    resume_content: string;
    modelName: GPTModels;
    eventManager: EventManager;
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

    return response["json"] as string
}