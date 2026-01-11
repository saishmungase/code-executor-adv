import { exec } from "child_process";
import fs from 'fs'
import { createClient } from "redis";
import { EXTENSIONS, getExecutionCommand } from "./libs.js";
import path from "path";

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

if (!fs.existsSync("executionArea")) {
    fs.mkdirSync("executionArea");
}

const executeCode = async (jobId: string, fileName: string, language: string, code: string) => {
    const jobDir = path.join("executionArea", jobId);

    return new Promise(async (resolve) => {
        const lang = language.toLowerCase();
        if (!(lang in EXTENSIONS)) {
            return resolve({ status: "Error", output: "Unsupported Language" });
        }

        try {
            if (!fs.existsSync(jobDir)) fs.mkdirSync(jobDir);
            
            const ext = EXTENSIONS[lang as keyof typeof EXTENSIONS];
            const filePath = path.join(jobDir, `${fileName}.${ext}`);
            fs.writeFileSync(filePath, code);

            const command = getExecutionCommand(ext, filePath, fileName, jobDir);

            exec(command, { timeout: 5000, maxBuffer: 1024 * 1024 * 5 }, (err, stdout, stderr) => {
                const jobOutput = {
                    status: (err || stderr) ? "Error" : "Success",
                    output: (err?.message || stderr || stdout).trim()
                };
                if (fs.existsSync(jobDir)) {
                    fs.rmSync(jobDir, { recursive: true, force: true });
                }
                
                resolve(jobOutput);
            });

        } catch (e) {
            if (fs.existsSync(jobDir)) {
                fs.rmSync(jobDir, { recursive: true, force: true });
            }
            resolve({ status: "Error", output: String(e) });
        }
    });
}

const startWorker = async () => {
    console.log("Initializing Worker")
    
    const client = createClient({ url: REDIS_URL });
    client.on('error', (err) => console.log('Redis Client Error', err));
    await client.connect();

    while(true){
        
        const submission = await client.brPop("pending", 0);

        if(!submission) continue;

        const jobData = JSON.parse(submission.element)

        const {jobId, fileName, language, code} = jobData
        console.log(`Received job with props as :- ${fileName}, ${language}`)
        console.log(`Execution Initiated for JobId:- ${jobId}`)

        jobData.response = await executeCode(jobId, fileName, language, code);

        await client.set(`result:${jobId}`, JSON.stringify(jobData));
        await client.expire(`result:${jobId}`, 600);

        console.log(`Execution Successfull For JobId:- ${jobId}`)
    }
}

startWorker();