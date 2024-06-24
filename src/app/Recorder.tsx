"use client";
import { useState } from "react";
import { AudioRecorder } from "react-audio-voice-recorder";
import { getUrlToUpladFile } from "./actions/getUrlToUpladFile";
import { EventAttributes, createEvent } from "ics";
import { getEventFile } from "./actions/getEventFile";

const FILE_EXTENSION = "webm";

export function Recorder({ }) {
    const [eventFileUrl, setEventFileUrl] = useState<string>("");
    const [isLoading, setIsLoading] = useState<boolean>(false);

    const onSubmit = async (blob: Blob) => {
        setIsLoading(true);
        const { url, fileName } = await getUrlToUpladFile();
        await uploadFile(url, blob);
        await tansformTextToEvent(fileName);
        setIsLoading(false);
    };

    const tansformTextToEvent = async (fileName: string) => {
        const event = await getEventFile(fileName);
        const filename = "Event.ics";
        const file = (await new Promise((resolve, reject) => {
            createEvent(event as unknown as EventAttributes, (error, value) => {
                if (error) {
                    reject(error);
                }

                resolve(new File([value], filename, { type: "text/calendar" }));
            });
        })) as Blob;

        const url = URL.createObjectURL(file);
        setEventFileUrl(url);
    }

    const recorderCanBeHidden = isLoading || !!eventFileUrl;

    return (
        <main>
            {!recorderCanBeHidden && (
                <AudioRecorder
                    onRecordingComplete={onSubmit}
                    audioTrackConstraints={{
                        noiseSuppression: true,
                        echoCancellation: true,
                    }}
                    downloadFileExtension={FILE_EXTENSION}
                />
            )}
            {isLoading && (
                <p>Loading...</p>
            )}
            {!!eventFileUrl && (
                <a href={eventFileUrl}>Link</a>
            )}
        </main>
    )
}

async function uploadFile(url: string, blob: Blob) {
    const fileType = "audio/webm";
    await fetch(url, {
        body: blob,
        method: "PUT",

        headers: {
            "Content-Type": fileType,
        },
    });
}
