export const API_KEY = process.env.HEYGEN_API_KEY || "ad1ee983-ff73-11f0-a99e-066a7fa2e369";
export const API_URL = process.env.HEYGEN_API_URL || "https://api.liveavatar.com";
export const AVATAR_ID = process.env.HEYGEN_AVATAR_ID || "7b888024-f8c9-4205-95e1-78ce01497bda";

// When true, we will call everything in Sandbox mode.
// Useful for integration and development.
export const IS_SANDBOX = process.env.HEYGEN_IS_SANDBOX === "true";

// FULL MODE Customizations
// Wayne's avatar voice and context
export const VOICE_ID = process.env.HEYGEN_VOICE_ID || "c2527536-6d1f-4412-a643-53a3497dada9";
export const CONTEXT_ID = process.env.HEYGEN_CONTEXT_ID || "af542887-189e-47d7-8561-155880dcf57b";
export const LANGUAGE = process.env.HEYGEN_LANGUAGE || "hi";

// CUSTOM MODE Customizations
export const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || "";
export const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
