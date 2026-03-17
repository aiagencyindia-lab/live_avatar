import { ElevenLabsClient } from "elevenlabs";
import { ELEVENLABS_API_KEY, ELEVENLABS_VOICE_ID } from "../secrets";
import { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { text, voiceId = ELEVENLABS_VOICE_ID } = await req.json(); // Use ElevenLabs voice id from secrets by default

    if (!text) {
      return new Response(JSON.stringify({ error: "Text is required" }), { status: 400 });
    }

    const client = new ElevenLabsClient({ apiKey: ELEVENLABS_API_KEY });
    
    const audioStream = await client.textToSpeech.convert(voiceId, {
      output_format: "pcm_24000",
      text,
      model_id: "eleven_flash_v2_5", // Use fastest model
    });

    // We need to convert the audio stream to a base64 string
    // because SessionApiClient.repeatAudio expects a base64 string
    const chunks: Buffer[] = [];
    for await (const chunk of audioStream) {
      chunks.push(Buffer.from(chunk));
    }
    const audioBuffer = Buffer.concat(chunks);
    const base64Audio = audioBuffer.toString("base64");

    return new Response(JSON.stringify({ audio: base64Audio }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("TTS API Error:", error);
    return new Response(JSON.stringify({ error: "Failed to generate TTS" }), { status: 500 });
  }
}
