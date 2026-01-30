"use client";

import { useEffect, useRef, useState } from "react";
// We are using livekit-client DIRECTLY here, bypassing the HeyGen SDK wrapper
import { Room, RoomEvent, VideoPresets, RemoteVideoTrack, RemoteAudioTrack } from "livekit-client";

export default function LiveKitDirectPage() {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [status, setStatus] = useState("Idle");
    const [room, setRoom] = useState<Room | null>(null);

    const startSession = async () => {
        try {
            setStatus("Getting Token...");

            // 1. Call our custom backend API to get LiveKit URL and Token
            const res = await fetch("/api/get-livekit-token", { method: "POST" });
            if (!res.ok) throw new Error(await res.text());

            const { url, token } = await res.json();

            setStatus("Connecting to LiveKit...");

            // 2. Connect using standard LiveKit Client
            const newRoom = new Room({
                adaptiveStream: true,
                dynacast: true,
                videoCaptureDefaults: {
                    resolution: VideoPresets.h720.resolution,
                },
            });

            // 3. Set up track listeners
            newRoom.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
                // We only care about the "heygen" participant (or whoever is sending video)
                if (track.kind === "video" || track.kind === "audio") {
                    if (videoRef.current) {
                        track.attach(videoRef.current);
                    }
                }
            });

            newRoom.on(RoomEvent.Disconnected, () => {
                setStatus("Disconnected");
                setRoom(null);
            });

            // 4. Connect
            await newRoom.connect(url, token);
            setStatus("Connected! Avatar should appear.");
            setRoom(newRoom);

        } catch (e) {
            console.error(e);
            setStatus("Error: " + (e as Error).message);
        }
    };

    const stopSession = async () => {
        if (room) {
            await room.disconnect();
            setRoom(null);
            setStatus("Disconnected");
        }
    };

    return (
        <div className="w-full h-screen flex flex-col items-center justify-center bg-black text-white gap-6">
            <h1 className="text-2xl font-bold">Direct LiveKit Integration Test</h1>

            <div className="relative w-[800px] aspect-video bg-gray-900 rounded-lg overflow-hidden border border-gray-700">
                <video
                    ref={videoRef}
                    className="w-full h-full object-contain"
                    autoPlay
                    playsInline
                />
                <div className="absolute top-2 left-2 bg-black/50 px-2 py-1 rounded">
                    Status: {status}
                </div>
            </div>

            <div className="flex gap-4">
                <button
                    onClick={startSession}
                    className="px-6 py-3 bg-green-600 hover:bg-green-700 rounded font-bold"
                >
                    Start (Direct LiveKit)
                </button>

                <button
                    onClick={stopSession}
                    className="px-6 py-3 bg-red-600 hover:bg-red-700 rounded font-bold"
                >
                    Stop
                </button>
            </div>

            <p className="max-w-md text-center text-gray-400 text-sm">
                This demo uses <code>livekit-client</code> directly, bypassing the <code>@heygen/liveavatar-web-sdk</code> wrapper.
            </p>
        </div>
    );
}
