"use client";

import { useMemo, useState } from "react";
import { LiveAvatarSession } from "./LiveAvatarSession";
import { SessionInteractivityMode } from "@heygen/liveavatar-web-sdk";

export type SessionMode = "FULL" | "FULL_PTT" | "CUSTOM";

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
  const [isLoading, setIsLoading] = useState(false);

  // Default to Full Duplex (false)
  const handleStartFullSession = async (pushToTalk: boolean = false) => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/start-session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ pushToTalk }),
      });
      if (!res.ok) {
        const error = await res.json();
        console.error("Failed to start full session", error);
        setError(error.error);
        setIsLoading(false);
        return;
      }
      const { session_token } = await res.json();
      setSessionToken(session_token);
      setMode(pushToTalk ? "FULL_PTT" : "FULL");
    } catch (error: unknown) {
      setError((error as Error).message);
      setIsLoading(false);
    }
    // Note: We do NOT set isLoading(false) here if successful, 
    // because we want to keep the "Loading" state (or just the idle video) 
    // until the stream is actually ready.
    // However, the button loading state should probably stop so the user knows it was clicked.
    // Let's keep button loading false, but use a separate state for the transition.
    setIsLoading(false);
  };

  const onSessionStopped = () => {
    setSessionToken("");
    setStreamReady(false);
  };

  const handleStreamReady = () => {
    setStreamReady(true);
  };

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
                ${sessionToken ? "opacity-0 pointer-events-none" : "opacity-100"}
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
                  disabled={isLoading}
                  className={`
                    group relative flex items-center justify-center
                    w-16 h-16 rounded-full 
                    bg-white/10 hover:bg-white/20 backdrop-blur-md
                    border border-white/20 hover:border-white/40
                    transition-all duration-300 ease-out
                    ${isLoading ? "opacity-50 cursor-not-allowed scale-95" : "hover:scale-110 active:scale-95"}
                  `}
                  aria-label="Start Conversation"
                >
                  {isLoading ? (
                    <div className="w-6 h-6 border-2 border-white/50 border-t-white rounded-full animate-spin" />
                  ) : (
                    <MicIcon className="w-8 h-8 text-white group-hover:drop-shadow-[0_0_8px_rgba(255,255,255,0.8)] transition-all" />
                  )}
                </button>
              </div>
            </div>

            {/* Loading Indicator (if session started but stream not ready) */}
            {sessionToken && !streamReady && (
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
            mode={mode}
            sessionAccessToken={sessionToken}
            voiceChatConfig={voiceChatConfig}
            onSessionStopped={onSessionStopped}
            onStreamReady={handleStreamReady}
          />
        </div>
      )}
    </div>
  );
};
