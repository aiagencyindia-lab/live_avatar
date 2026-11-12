"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
  LiveAvatarSession,
  SessionEndInfo,
  describeStartError,
} from "./LiveAvatarSession";
import { SessionInteractivityMode } from "@heygen/liveavatar-web-sdk";

export type SessionMode = "FULL" | "FULL_PTT" | "CUSTOM";

// How many times a failed connection is retried before showing the error.
const MAX_AUTO_RETRIES = 1;

// Ask for the microphone before a session is created. A session costs
// credits from the moment it starts, so a blocked or missing mic should be
// reported first rather than after the session is already running.
// Returns an error message, or null when the mic is usable.
const checkMicrophone = async (): Promise<string | null> => {
  if (!navigator.mediaDevices?.getUserMedia) {
    return "The microphone is not available. Open this page over HTTPS in a supported browser.";
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) => track.stop());
    return null;
  } catch (err) {
    return describeStartError(err).error ?? "The microphone could not be opened.";
  }
};

const MicIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <path d="M12 19v3" />
    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
    <rect x="9" y="2" width="6" height="13" rx="3" />
  </svg>
);

export const LiveAvatarDemo = () => {
  const [sessionToken, setSessionToken] = useState("");
  const [mode, setMode] = useState<SessionMode>("FULL");
  const [error, setError] = useState<string | null>(null);
  // State to track if the live stream is ready
  const [streamReady, setStreamReady] = useState(false);
  // True from the moment the user taps the mic until the avatar is on
  // screen or the attempt (including any automatic retry) has failed.
  const [connecting, setConnecting] = useState(false);
  const retryCountRef = useRef(0);
  const pushToTalkRef = useRef(false);

  const startFullSession = useCallback(async (pushToTalk: boolean) => {
    pushToTalkRef.current = pushToTalk;
    setConnecting(true);
    setError(null);
    const micError = await checkMicrophone();
    if (micError) {
      setError(micError);
      setConnecting(false);
      return;
    }
    try {
      const res = await fetch("/api/start-session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ pushToTalk }),
      });
      if (!res.ok) {
        // The route does not always answer with JSON.
        const body = await res.json().catch(() => null);
        throw new Error(
          body?.error || `Could not start the session (HTTP ${res.status})`,
        );
      }
      const { session_token } = await res.json();
      if (!session_token) {
        throw new Error("Could not start the session (no session token)");
      }
      setMode(pushToTalk ? "FULL_PTT" : "FULL");
      setSessionToken(session_token);
    } catch (error: unknown) {
      console.error("Failed to start full session", error);
      setError((error as Error).message);
      setConnecting(false);
    }
  }, []);

  // Default to Full Duplex (false)
  const handleStartFullSession = (pushToTalk: boolean = false) => {
    retryCountRef.current = 0;
    void startFullSession(pushToTalk);
  };

  const onSessionEnded = useCallback(
    (info: SessionEndInfo) => {
      setSessionToken("");
      setStreamReady(false);

      if (info.retryable && retryCountRef.current < MAX_AUTO_RETRIES) {
        retryCountRef.current += 1;
        console.warn(
          `Session failed (${info.error}); retrying ${retryCountRef.current}/${MAX_AUTO_RETRIES}`,
        );
        void startFullSession(pushToTalkRef.current);
        return;
      }

      setConnecting(false);
      if (info.error) {
        setError(info.error);
      }
    },
    [startFullSession],
  );

  const handleStreamReady = useCallback(() => {
    retryCountRef.current = 0;
    setConnecting(false);
    setStreamReady(true);
  }, []);

  const isBusy = connecting || !!sessionToken;

  const voiceChatConfig = useMemo(() => {
    if (mode === "FULL_PTT") {
      return {
        mode: SessionInteractivityMode.PUSH_TO_TALK,
      };
    }
    return true;
  }, [mode]);

  return (
    <div className="w-screen h-screen bg-black overflow-hidden relative font-sans text-white">
      {/* 
         IDLE/LOADING LAYER 
         Keep this visible until the stream is ready OR if there is no session token.
         We fade it out when streamReady is true.
      */}
      <div
        className={`absolute inset-0 z-20 transition-opacity duration-1000 ease-in-out pointer-events-none 
          ${streamReady ? "opacity-0" : "opacity-100"}
        `}
      >
        {(!streamReady || !sessionToken) && (
          <div className="w-full h-full relative flex items-center justify-center pointer-events-auto">
            {/* Background Idle Video */}
            <video
              src="ava video.mp4"
              autoPlay
              loop
              muted
              playsInline
              className="absolute inset-0 w-full h-full object-cover"
            />

            {/* Controls */}
            <div
              className={`absolute inset-0 z-10 p-8 flex flex-col justify-between transition-opacity duration-500
                ${isBusy ? "opacity-0 pointer-events-none" : "opacity-100"}
              `}
            >
              {/* Top Bar (Optional: Title/Logo) */}
              <div className="flex justify-between items-start">
                {error && (
                  <div className="bg-red-500/80 text-white px-4 py-2 rounded-lg backdrop-blur text-sm max-w-md">
                    {"Error: " + error}
                    <button onClick={() => setError(null)} className="ml-4 underline">
                      Dismiss
                    </button>
                  </div>
                )}
              </div>

              {/* Bottom Bar: Action Button */}
              <div className="flex justify-end items-end">
                <button
                  onClick={() => handleStartFullSession(false)}
                  disabled={isBusy}
                  className={`
                    group relative flex items-center justify-center
                    w-16 h-16 rounded-full 
                    bg-white/10 hover:bg-white/20 backdrop-blur-md
                    border border-white/20 hover:border-white/40
                    transition-all duration-300 ease-out
                    ${isBusy ? "opacity-50 cursor-not-allowed scale-95" : "hover:scale-110 active:scale-95"}
                  `}
                  aria-label="Start Conversation"
                >
                  {isBusy ? (
                    <div className="w-6 h-6 border-2 border-white/50 border-t-white rounded-full animate-spin" />
                  ) : (
                    <MicIcon className="w-8 h-8 text-white group-hover:drop-shadow-[0_0_8px_rgba(255,255,255,0.8)] transition-all" />
                  )}
                </button>
              </div>
            </div>

            {/* Loading Indicator (connecting, or stream not ready yet) */}
            {isBusy && !streamReady && (
              <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none">
                <div className="w-12 h-12 border-4 border-white/20 border-t-white rounded-full animate-spin backdrop-blur-sm" />
              </div>
            )}
          </div>
        )}
      </div>

      {/* ACTIVE SESSION LAYER */}
      {sessionToken && (
        <div className="absolute inset-0 z-10 w-full h-full">
          <LiveAvatarSession
            // A new token is a new session: never reuse the old instance.
            key={sessionToken}
            mode={mode}
            sessionAccessToken={sessionToken}
            voiceChatConfig={voiceChatConfig}
            onSessionEnded={onSessionEnded}
            onStreamReady={handleStreamReady}
            roomOptions={{
              adaptiveStream: true,
              dynacast: true,
            }}
          />
        </div>
      )}
    </div>
  );
};
