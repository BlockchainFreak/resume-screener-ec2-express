import { z } from "zod";
import { ChatOpenAI } from 'langchain/chat_models/openai'
import { createStructuredOutputChainFromZod } from "langchain/chains/openai_functions";
import { PDFLoader } from "langchain/document_loaders/fs/pdf";
import {
    ChatPromptTemplate,
    SystemMessagePromptTemplate,
    HumanMessagePromptTemplate,
} from "langchain/prompts";
import { readFileSync } from 'fs';
import { join } from 'path';

import dotenv from "dotenv";
dotenv.config()

// max content window: 4k tokens
const GPT3 = "gpt-3.5-turbo-0613"

// max content window: 16k tokens
const GPT3L = "gpt-3.5-turbo-16k-0613"

// max content window: 8k tokens
const GPT4 = "gpt-4-0613"

// 0613 is a specific version that allows function calling 

const llm = new ChatOpenAI({
    // To make model deterministic
    temperature: 0,
    // no token limit
    maxTokens: -1,
    maxConcurrency: 20,
    modelName: GPT4,

})


//declare schme using zod

const JDesc = z.object({
    jobTitle: z.string().describe('Use full form of position of the job i.e. use "Senior Python Engineer" if "Sr Python Engineer" is mentioned.'),
    jobLocation: z.string().describe('State on-site if not specified. Only add geographical location if specified.').optional(),
    jobType: z.string().describe('State full-time if not specified').optional(),
    reqExperience: z.array(z.object({
        exName: z.string(),
        exCategory: z.enum(["programming language", "framework", "tool", "industry", "skill"]).optional(),
        exIndustry: z.string(),
        minExperience: z.number().optional().describe("State 1 year if not specified."),
        exPriority: z.enum(["required", "preferred"]).describe('State "required" if not specified.')
    })),
    reqEducation: z.string().describe("Only add education which is listed. If not specified, state 'Not specified.'"),
    keywords: z.string().describe('all the keywords from the text.')
})

type JobDesc = z.infer<typeof JDesc>


const clean = async (content: string) => {
    const jd = content
        .replace(/\n+/g, "\n")
        .replace(/\s+/g, " ")
        .replace(/[^\x00-\x7F]/g, '')
        .replace(", ", ",")
        .replace(new RegExp(", ", "g"), ",")
        .replace(/\(http.?[\s\n]/g, '')
        .replace(/\(www.?[\s\n]/g, '')

    return jd
}


const prompt = new ChatPromptTemplate({
    promptMessages: [
        SystemMessagePromptTemplate.fromTemplate(
            "extract the following information from job description given: 1. Job Title. This should contain the position i.e. 'Associate', 'Senior' and the job title 'Software Engineer', 'Full Stack Developer'. 2. Job Location. This should contain the type of location i.e. 'on-site', 'hybrid' etc. Add the geographical location only if mentioned. 3. Job Type. This should contain the type of job i.e. 'contract', 'part-time', 'full-time' etc.) 4. Required Education. 5. Required Experience. This should contain all the that needed for the specific job along with the category of that particular experience ('programming language', 'framework', 'tool', 'industry', 'skill'). Note that an experience will only be categorized as 'industry' if it is a vast specification i.e. 'Software Engineering' is not a tool but rather an industry experience and hence would be categorized accordingly. Also note that each experience may have different industry. For example, 'C#' belongs to the 'IT' industry while 'Unity' belongs to the 'Game Development' industry. The required experience should also categorize the experience in the relevant industry i.e. 'Python' belongs to the 'IT' industry, 'Adobe Illustrator' belongs to the 'Graphic Design' industry. The required skill should also have the the experience needed in number of years; assume 1 year of experience needed if not explicitly mentioned. Lastly, the required experience should also be categorized based on its priority ('required', 'preferred'). An example: Job Description: 'Experience in software engineering (5+);  Experience in microservices architecture design;  Experience with Ruby; Experience with AWS (required); Experience with Kubernetes (required); Experience with Golang, React/Node (preferred); Experience with Unity (preferred); Experience with C# (3+); Mobile Game Development' .The output should be: 'Required Experience:  [1. software engineering (industry, IT, 5+, required); 2. microservices architecture design(skill, IT, 1, required); 3.Ruby(programming language, IT, 1, required); 4. .AWS(tool, IT, 1, required); 5. .Kubernetes(tool, IT, 1, required); 6. Golang(programming language, IT, 1, preferred); 7. React(programming language, IT, 1, preferred); 8. Node(programming language, IT, 1, preferred); 9. Unity(programming language, Game Development, 1, preferred); 10. C#(programming language, IT, 3, required); 11. Mobile Game Development(industry, Game Development, 1, required)]. Extract every keyword from the whole text."
        ),
        HumanMessagePromptTemplate.fromTemplate("{jd}"),
    ],
    inputVariables: ["jd"],
});


const chain = createStructuredOutputChainFromZod(JDesc, {
    prompt,
    llm,
    outputKey: 'jd'
});


export const processjD = async (text: string) => {
    const textCleaned = await clean(text)
    const response = await chain.call({ jd: textCleaned }) as { jd: JobDesc };
    return JSON.stringify(response.jd, null, 2)
}

// const jdOutputSchema = z.object({
//     keywordName: z.string().describe("The name of the skill required for the job."),
//     category: z.enum(["Programming Language", "Framework", "Tool", "Software" ,"Industry"]).optional().describe("The category of the skill. It can be a programming language, framework, tool, or industry."),
//     minExperience: z.number().optional().describe("The minimum experience required for the skill, in years."),
//     priority: z.enum(["required", "preferred"]).optional().describe("The priority of the skill. It can be either required or preferred. If not specified, it is assumed to be required."),
// })