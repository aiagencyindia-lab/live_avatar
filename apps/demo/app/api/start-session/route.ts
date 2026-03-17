import { NextRequest } from "next/server";
import {
  API_KEY,
  API_URL,
  AVATAR_ID,
  VOICE_ID,
  CONTEXT_ID,
  LANGUAGE,
  IS_SANDBOX,
} from "../secrets";

interface StartSessionRequestBody {
  pushToTalk?: boolean;
  mode?: "FULL" | "CUSTOM";
}

export async function POST(request: NextRequest) {
  let session_token = "";
  let session_id = "";
  try {
    const body: StartSessionRequestBody = await request
      .json()
      .catch(() => ({}));
    const pushToTalk = body.pushToTalk === true;
    const mode = body.mode || "FULL";
    
    // CUSTOM mode payload doesn't need avatar_persona
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payload: any = {
      mode: mode,
      avatar_id: AVATAR_ID,
      is_sandbox: IS_SANDBOX,
    };
    
    if (mode === "FULL") {
        payload.avatar_persona = {
          voice_id: VOICE_ID,
          context_id: CONTEXT_ID,
          language: LANGUAGE,
        };
    }
    // CUSTOM mode: no avatar_persona needed — we handle LLM + TTS ourselves
    
    if (pushToTalk) {
      payload.interactivity_type = "PUSH_TO_TALK";
    }

    const res = await fetch(`${API_URL}/v1/sessions/token`, {
      method: "POST",
      headers: {
        "X-API-KEY": API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      // Check if response is JSON before parsing
      const contentType = res.headers.get("content-type");
      let errorMessage = "Failed to retrieve session token";

      if (contentType && contentType.includes("application/json")) {
        try {
          const resp = await res.json();
          if (resp.data && resp.data.length > 0) {
            errorMessage = resp.data[0].message;
          } else if (resp.error) {
            errorMessage = resp.error;
          } else if (resp.message) {
            errorMessage = resp.message;
          }
        } catch (e) {
          console.error("Failed to parse error response:", e);
        }
      } else {
        // If it's not JSON, try to get the text
        const text = await res.text();
        console.log("Error response (text):", text);
        errorMessage = text || errorMessage;
      }

      return new Response(JSON.stringify({ error: errorMessage }), {
        status: res.status,
      });
    }

    const data = await res.json();

    session_token = data.data.session_token;
    session_id = data.data.session_id;
  } catch (error) {
    console.error("Error retrieving session token:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
    });
  }

  if (!session_token) {
    return new Response("Failed to retrieve session token", {
      status: 500,
    });
  }
  return new Response(JSON.stringify({ session_token, session_id }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
    },
  });
}
