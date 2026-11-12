export const API_KEY = process.env.HEYGEN_API_KEY || "b7fb9d64-f9df-11f0-a99e-066a7fa2e369";
export const API_URL = process.env.HEYGEN_API_URL || "https://api.liveavatar.com";
export const AVATAR_ID = process.env.HEYGEN_AVATAR_ID || "6e95b03b-3efb-4f78-ade5-3e0e9e82d8c2";

// When true, we will call everything in Sandbox mode.
// Useful for integration and development.
// Sandbox is on only when HEYGEN_IS_SANDBOX is exactly "true".
export const IS_SANDBOX = process.env.HEYGEN_IS_SANDBOX === "true";

// FULL MODE Customizations
// Wayne's avatar voice and context
export const VOICE_ID = process.env.HEYGEN_VOICE_ID || "1acc03e6-c80d-47bd-aeec-12f99cbd6f4c";
export const CONTEXT_ID = process.env.HEYGEN_CONTEXT_ID || "42a889c9-49ab-4a85-bae7-052a3fbbae8f";
export const LANGUAGE = process.env.HEYGEN_LANGUAGE || "hi";

// Voice engine. The avatar's voice is a clone that has to speak Hindi, so
// use ElevenLabs' multilingual model rather than the low-latency default
// ("eleven_flash_v2_5"), which is less stable on non-English speech.
// Set HEYGEN_VOICE_MODEL=default to let HeyGen choose.
const VOICE_MODEL = process.env.HEYGEN_VOICE_MODEL || "eleven_multilingual_v2";
const VOICE_STABILITY = Number(process.env.HEYGEN_VOICE_STABILITY || "0.75");

// Speech recognition provider: deepgram | elevenlabs | gladia.
// Set HEYGEN_STT_PROVIDER=auto to let HeyGen choose.
const STT_PROVIDER = process.env.HEYGEN_STT_PROVIDER || "elevenlabs";

// Optional: the model that writes the replies (gpt-4o, gpt-4o-mini, ...).
// Unset uses HeyGen's default.
const LLM_MODEL = process.env.HEYGEN_LLM_MODEL || "";

// Persona sent with every FULL mode session token.
export const AVATAR_PERSONA = {
  voice_id: VOICE_ID,
  context_id: CONTEXT_ID,
  language: LANGUAGE,
  ...(VOICE_MODEL !== "default" && {
    voice_settings: {
      provider: "elevenLabs",
      model: VOICE_MODEL,
      stability: VOICE_STABILITY,
    },
  }),
  ...(STT_PROVIDER !== "auto" && {
    stt_config: { provider: STT_PROVIDER },
  }),
  ...(LLM_MODEL && {
    llm_settings: { provider: "openai", model: LLM_MODEL },
  }),
};

// CUSTOM MODE Customizations
export const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || "";
export const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
