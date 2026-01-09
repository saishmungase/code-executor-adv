import express, { type NextFunction } from 'express'
import type { Request, Response } from 'express';
import { createClient } from "redis";
import { v4 } from 'uuid';
import { Job } from './job.js';

const app = express();
const client = createClient();
await client.connect();

type JOB_TYPE = {
    jobId : string,
    user : string,
    fileName : string,
    language : string,
    code : string,
    extension : string,
    response : string | number,
    workerId : number
}

const jobGenerator = (user : string, jobId : string, filename : string, language : string, code : string, extension : string) => {
    const job : JOB_TYPE = new Job(jobId, user, filename, language, code, extension);
    return job;
}

const validBody = (req : Request, res : Response, next : NextFunction) => {
    if(!req.body || Object.keys(req.body).length === 0){
        res.status(400).json({ status: "error", message: "Missing body" });
        return;
    }
    next();
}

app.use(express.json())

app.get("/status/:jobId", async (req : Request, res : Response) => {

    const jobId = req.params.jobId;
    const key = `result:${jobId}`;
    let job;
    try {
        job = await client.GET(key);
        if(!job){
            res.send(JSON.stringify({
                status : "pending",
                message : "Your Job is under Construction"
            }))
            return;
        }
    } catch (error) {
        res.send(JSON.stringify({
            status : "pop-issue",
            message : "Unable to add the job on queue"
        }))
        return;
    }

    res.send(JSON.stringify({ 
        status : "pop-success",
        message: "Job Execution Successfull", 
        data : JSON.parse(job) 
    }));
})

app.post("/set-job", validBody, async(req : Request, res : Response) => {
    
    const { user, filename, language, code, extension} = req.body;

    const jobId = v4();

    const userJob = jobGenerator(user, jobId, filename, language, code, extension)

    try{
        await client.LPUSH("pending", JSON.stringify(userJob));
    }
    catch(e){
        res.send(JSON.stringify({
            status : "push-issue",
            message : "Unable to add the job on queue"
        }))
        return;
    }

    res.send(JSON.stringify({ 
        status : "push-success",
        message: "Job Queued", 
        jobId: jobId, 
        statusUrl: `/status/${jobId}` 
    }));
});


app.listen(3000, () => {
    console.log("Listening at port 3000")
})