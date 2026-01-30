export const API_KEY = process.env.HEYGEN_API_KEY || "";
export const API_URL = process.env.HEYGEN_API_URL || "https://api.liveavatar.com";
export const AVATAR_ID = process.env.HEYGEN_AVATAR_ID || "";

// When true, we will call everything in Sandbox mode.
// Useful for integration and development.
export const IS_SANDBOX = process.env.HEYGEN_IS_SANDBOX === "true";

// FULL MODE Customizations
// Wayne's avatar voice and context
export const VOICE_ID = process.env.HEYGEN_VOICE_ID || "c2527536-6d1f-4412-a643-53a3497dada9";
export const CONTEXT_ID = process.env.HEYGEN_CONTEXT_ID || "5b9dba8a-aa31-11f0-a6ee-066a7fa2e369";
export const LANGUAGE = process.env.HEYGEN_LANGUAGE || "en";

// CUSTOM MODE Customizations
export const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || "";
export const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
