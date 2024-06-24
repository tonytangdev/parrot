"use server";

import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import OpenAI, { toFile } from "openai";
import type { ToFileInput } from "openai/uploads.mjs";
import { z } from "zod";

const s3Client = new S3Client({
  region: process.env.AWS_REGION,
});
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});
const STT_MODEL: string = "whisper-1";
const COMPLETION_MODEL: string = "gpt-4o";
const maxTokens: number = 200;

const year = z.number().min(1900).max(2100);
const month = z.number().min(1).max(12);
const day = z.number().min(1).max(31);
const hour = z.number().min(0).max(23);
const minute = z.number().min(0).max(59);

const startSchema = z.tuple([year, month, day, hour, minute]);

const durationSchema = z.object({
  hours: z.number().min(0),
  minutes: z.number().min(0).max(59),
});

const organizerSchema = z.object({
  name: z.string(),
  email: z.string().email().optional(),
});

const attendeeSchema = z.object({
  name: z.string(),
  email: z.string().email().optional(),
});

const vEventSchema = z.object({
  start: startSchema,
  duration: durationSchema,
  title: z.string(),
  description: z.string(),
  location: z.string(),
  categories: z.array(z.string()),
  organizer: organizerSchema,
  attendees: z.array(attendeeSchema),
});

export async function initAction() {
  // work around to avoid top level await error
  // https://github.com/vercel/next.js/issues/54282#issuecomment-1880221357
}

export async function getEventFile(fileName: string) {
  if (!fileName) {
    throw new Error("fileName is required");
  }

  try {
    const audioFile = await fetchAudioFile(fileName);
    const transcription = await transcribeAudioFile(audioFile);
    const event = await transformToVEvent(transcription);

    return event;
  } catch (error) {
    console.error("Error getting event file", error);
    throw new Error("Error getting event file");
  }
}

async function fetchAudioFile(fileName: string) {
  const body = await getFileFromS3(fileName);
  const file = toFile(body as ToFileInput, fileName);
  return file;
}

async function getFileFromS3(fileName: string) {
  const command = new GetObjectCommand({
    Bucket: process.env.BUCKET_NAME,
    Key: fileName,
  });

  const response = await s3Client.send(command);
  if (!response.Body) {
    throw new Error(`File ${fileName} not found`);
  }
  return response.Body;
}

async function transcribeAudioFile(
  file: Awaited<ReturnType<typeof fetchAudioFile>>
) {
  const transcription = await openai.audio.transcriptions.create({
    model: STT_MODEL,
    file: file,
    response_format: "text",
  });
  return transcription as unknown as string;
}

async function transformToVEvent(transcription: string) {
  const response = await askOpenAIToGenerateTheVeventObject(transcription);
  const content = JSON.parse(response?.choices?.[0]?.message?.content ?? "{}");

  const vEvent = buildVEvent(content);
  return vEvent;
}

async function askOpenAIToGenerateTheVeventObject(text: string) {
  const currentDate = new Date();
  const response = await openai.chat.completions.create({
    model: COMPLETION_MODEL,
    messages: [
      {
        role: "system",
        content: `
                Act as a machine that translates a transcript into an event object as json. You will only answer with a json. 
                Here's what the event type looks like :
                
                export class Event {
                    private busyStatus: "BUSY" = "BUSY";
                  
                    constructor(
                      private start: [
                        year: number,
                        month: number,
                        day: number,
                        hour: number,
                        minute: number
                      ],
                      private duration: { hours: number; minutes: number },
                      private title: string,
                      private description: string,
                      private location: string,
                      private categories: string[],
                      private organizer: { name: string; email?: string },
                      private attendees: {
                        name: string;
                        email?: string;
                      }[]
                    ) {}
                  }
                
                If there are no emails, do not set them as empty strings.

                Using the transcript, create the event json. If no date is explecitly mentioned, return {"message¨: "NO_EVENT_FOUND"}.
                Today, we are the ${currentDate.toDateString()}
                `,
      },
      {
        role: "user",
        content: text,
      },
    ],
    max_tokens: maxTokens,
    n: 1,
    response_format: { type: "json_object" },
  });

  return response;
}

function buildVEvent(content: unknown) {
  const vevent = vEventSchema.parse(content);

  return vevent;
}
