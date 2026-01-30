import { NextRequest } from "next/server";
import {
    API_KEY,
    API_URL,
    AVATAR_ID,
    VOICE_ID,
    CONTEXT_ID,
    LANGUAGE,
} from "../secrets";

export async function POST(request: NextRequest) {
    try {
        // 1. Get Session Token
        const tokenRes = await fetch(`${API_URL}/v1/sessions/token`, {
            method: "POST",
            headers: {
                "X-API-KEY": API_KEY,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                mode: "FULL", // Using FULL mode for simplicity in this demo
                avatar_id: AVATAR_ID,
                avatar_persona: {
                    voice_id: VOICE_ID,
                    context_id: CONTEXT_ID,
                    language: LANGUAGE,
                },
            }),
        });

        if (!tokenRes.ok) {
            const err = await tokenRes.text();
            return new Response(JSON.stringify({ error: "Failed to get token: " + err }), { status: 500 });
        }
        const tokenData = await tokenRes.json();
        const sessionToken = tokenData.data.session_token;

        // 2. Start Session to get LiveKit Credentials
        const startRes = await fetch(`${API_URL}/v1/sessions/start`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${sessionToken}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({}),
        });

        if (!startRes.ok) {
            const err = await startRes.text();
            return new Response(JSON.stringify({ error: "Failed to start session: " + err }), { status: 500 });
        }

        const startData = await startRes.json();
        const { livekit_url, livekit_client_token, session_id } = startData.data;

        // 3. Return Creds to Frontend
        return new Response(JSON.stringify({
            url: livekit_url,
            token: livekit_client_token,
            sessionId: session_id
        }), {
            status: 200,
            headers: { "Content-Type": "application/json" }
        });

    } catch (error) {
        return new Response(JSON.stringify({ error: (error as Error).message }), {
            status: 500,
        });
    }
}
