"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  LiveAvatarContextProvider,
  useSession,
  useVoiceChat,
} from "../liveavatar";
import { useLiveAvatarContext } from "../liveavatar/context";
import {
  SessionState,
  VoiceChatConfig,
  RoomOptions,
  RoomConnectOptions,
} from "@heygen/liveavatar-web-sdk";
import { useAvatarActions } from "../liveavatar/useAvatarActions";
import { SessionMode } from "./LiveAvatarDemo";

const LiveAvatarSessionComponent: React.FC<{
  mode: SessionMode;
  onSessionStopped: () => void;
  onStreamReady?: () => void;
}> = ({ mode, onSessionStopped, onStreamReady }) => {
  const {
    sessionState,
    isStreamReady,
    startSession,
    stopSession,
    keepAlive,
    attachElement,
  } = useSession();
  const {
    isAvatarTalking,
    isUserTalking,
    isMuted,
    isActive,
    mute,
    unmute,
  } = useVoiceChat();

  // For useAvatarActions, treat FULL_PTT as FULL since they share the same API
  const avatarActionsMode = mode === "FULL_PTT" ? "FULL" : mode;
  const { interrupt } = useAvatarActions(avatarActionsMode);

  // In CUSTOM mode, voice chat is disabled so isActive is always false.
  // Use sessionState instead to know when the session is ready.
  const isSessionReady = mode === "CUSTOM"
    ? sessionState === SessionState.CONNECTED
    : isActive;

  const videoRef = useRef<HTMLVideoElement>(null);

  const [, setChatHistory] = useState<{ role: "user" | "assistant" | "system"; content: string }[]>([]);
  const chatHistoryRef = useRef<{ role: "user" | "assistant" | "system"; content: string }[]>([]);
  const { sessionRef } = useLiveAvatarContext();

  // Robust pipeline states to ensure everything finishes before unmuting
  const isPlayingResponseRef = useRef(false);
  const isChatStreamingRef = useRef(false);
  const isFetchingTtsRef = useRef(false);
  const isPlayingAudioRef = useRef(false);

  // Queues to decouple TTS fetching vs audio playback (zero-latency streaming)
  const ttsTextQueueRef = useRef<string[]>([]);
  const audioPlayQueueRef = useRef<{ audio: string; text: string }[]>([]);

  // AbortController to cancel in-flight processChat when a new one starts
  const abortControllerRef = useRef<AbortController | null>(null);

  // Keep a ref to voiceChat functions to avoid stale closures
  const voiceChatRef = useRef({ mute, unmute });
  voiceChatRef.current = { mute, unmute };

  // ─── Session lifecycle ────────────────────────────────────────────
  useEffect(() => {
    if (sessionState === SessionState.DISCONNECTED) {
      onSessionStopped();
    }
  }, [sessionState, onSessionStopped]);

  useEffect(() => {
    if (isStreamReady && videoRef.current) {
      attachElement(videoRef.current);
      onStreamReady?.();
    }
  }, [attachElement, isStreamReady, onStreamReady]);

  useEffect(() => {
    if (sessionState === SessionState.INACTIVE) {
      startSession();
    }
  }, [startSession, sessionState]);

  useEffect(() => {
    if (sessionState !== SessionState.CONNECTED) return;
    const keepAliveInterval = setInterval(() => {
      keepAlive().catch((err) => {
        console.warn("Keep-alive ping failed (non-fatal):", err);
      });
    }, 30_000);
    return () => clearInterval(keepAliveInterval);
  }, [sessionState, keepAlive]);

  // ─── Auto-mute logic (FULL mode only) ────────────────────────────
  // In FULL mode, HeyGen controls STT and we mute/unmute based on avatar state.
  // In CUSTOM mode, we handle STT ourselves via browser SpeechRecognition,
  // so we don't need to mute/unmute the LiveKit mic.
  useEffect(() => {
    if (mode === "CUSTOM") return; // No auto-mute in custom mode
    if (!isSessionReady) return;

    if (isAvatarTalking) {
      voiceChatRef.current.mute();
    } else {
      // Small delay to let echo dissipate
      const timer = setTimeout(() => {
        voiceChatRef.current.unmute();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [isAvatarTalking, isSessionReady, mode]);

  // ─── CUSTOM mode: Browser Speech Recognition ─────────────────────
  useEffect(() => {
    if (mode !== "CUSTOM" || !sessionRef.current || !isSessionReady) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn("Browser Speech Recognition not supported.");
      return;
    }

    let isCancelled = false;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recognition = new SpeechRecognition() as any;
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = "en-US";

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      // If avatar is currently playing a response, ignore user speech
      if (isPlayingResponseRef.current) {
        console.log("[SpeechRecognition] Ignored — avatar is speaking");
        return;
      }

      const result = event.results[event.results.length - 1];
      if (result.isFinal) {
        const text = result[0].transcript;
        if (!text || text.trim().length === 0) return;

        console.log("[SpeechRecognition] Final:", text);

        const newHistory = [...chatHistoryRef.current, { role: "user" as const, content: text }];
        chatHistoryRef.current = newHistory;
        setChatHistory(newHistory);
        processChat(newHistory);
      }
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onerror = (event: any) => {
      // "aborted" and "no-speech" are not real errors
      if (event.error === "aborted" || event.error === "no-speech") return;
      console.error("[SpeechRecognition] Error:", event.error);
    };

    recognition.onend = () => {
      if (!isCancelled && isSessionReady && mode === "CUSTOM") {
        // Small delay before restarting to avoid rapid restart loops
        setTimeout(() => {
          if (!isCancelled) {
            try {
              recognition.start();
            } catch (e) {
              console.error("[SpeechRecognition] Restart failed:", e);
            }
          }
        }, 100);
      }
    };

    try {
      recognition.start();
    } catch (e) {
      console.error("[SpeechRecognition] Start failed:", e);
    }

    return () => {
      isCancelled = true;
      recognition.onend = null;
      try {
        recognition.stop();
      } catch {
        // ignore
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, sessionRef, isSessionReady]);

  // ─── Pipeline State Management ──────────────────────────────────────
  const checkIfAllDone = () => {
    // Only unlock the microphone when stream is done, no text is fetching, and no audio is playing
    if (!isChatStreamingRef.current && !isFetchingTtsRef.current && !isPlayingAudioRef.current) {
      isPlayingResponseRef.current = false;
      console.log("[Pipeline] All done — User can speak again.");
    }
  };

  // ─── 1. TTS Fetcher Queue ───────────────────────────────────────
  const processTtsFetchQueue = async () => {
    if (isFetchingTtsRef.current) return;
    isFetchingTtsRef.current = true;

    while (ttsTextQueueRef.current.length > 0) {
      const text = ttsTextQueueRef.current.shift();
      if (!text || text.trim().length === 0) continue;

      try {
        const ttsRes = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: text.trim() }),
        });
        const data = await ttsRes.json();
        if (data.audio) {
          audioPlayQueueRef.current.push({ audio: data.audio, text: text.trim() });
          // Start playback process immediately as soon as we have one piece
          processAudioPlayQueue();
        }
      } catch (e) {
        console.error("[TTS Fetch] Error:", e);
      }
    }

    isFetchingTtsRef.current = false;
    checkIfAllDone();
  };

  // ─── 2. TTS Playback Queue ──────────────────────────────────────
  const processAudioPlayQueue = async () => {
    if (isPlayingAudioRef.current) return;
    isPlayingAudioRef.current = true;

    while (audioPlayQueueRef.current.length > 0) {
      const item = audioPlayQueueRef.current.shift();
      if (!item) continue;

      try {
        sessionRef.current?.repeatAudio(item.audio);

        // Estimate based on PCM audio length: base64 string length * 0.75 / (24000 * 2) seconds
        // Reduce the buffer to 100ms to make it conversational and avoid awkward pauses
        const audioBytes = (item.audio.length * 3) / 4;
        const durationMs = (audioBytes / (24000 * 2)) * 1000;
        await new Promise((resolve) => setTimeout(resolve, durationMs + 100));
      } catch (e) {
        console.error("[TTS Playback] Error:", e);
      }
    }

    isPlayingAudioRef.current = false;
    checkIfAllDone();
  };

  // ─── 3. Process Chat (LLM Streamer) ──────────────────────────────
  const processChat = async (history: { role: string; content: string }[]) => {
    // If already processing, abort it
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;
    
    // Lock the pipeline
    isPlayingResponseRef.current = true;
    isChatStreamingRef.current = true;

    try {
      interrupt(); // Stop avatar speech

      // Clear pending queues
      ttsTextQueueRef.current = [];
      audioPlayQueueRef.current = [];

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }),
        signal: controller.signal,
      });

      if (!res.body) return;

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let fullAssistantText = "";

      let done = false;
      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        if (value) {
          buffer += decoder.decode(value, { stream: true });
          
          // Match punctuations including Hindi purna viram (।) and newlines
          const sentences = buffer.match(/[^.!?।\n]+[.!?।\n]+/g);
          if (sentences) {
            for (const sentence of sentences) {
              fullAssistantText += sentence;
              ttsTextQueueRef.current.push(sentence.trim());
              processTtsFetchQueue(); // Trigger fetch immediately
            }
            // Keep the unmatched remainder
            const matched = sentences.join("");
            buffer = buffer.slice(matched.length);
          }
        }
      }

      // Flush remaining buffer
      if (buffer.trim()) {
        fullAssistantText += buffer;
        ttsTextQueueRef.current.push(buffer.trim());
        processTtsFetchQueue();
      }

      const updatedHistory = [...chatHistoryRef.current, { role: "assistant" as const, content: fullAssistantText }];
      chatHistoryRef.current = updatedHistory;
      setChatHistory(updatedHistory);

    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        console.error("[processChat] Error:", e);
      }
    } finally {
      isChatStreamingRef.current = false;
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
      checkIfAllDone();
    }
  };

  return (
    <div className="w-full h-full flex flex-col items-center justify-center bg-black relative">
      <div className="absolute inset-0 w-full h-full flex flex-col items-center justify-center">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          className="w-full h-full object-contain"
        />
        {/* Status indicator showing listening/muted state */}
        {isSessionReady && (
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-50">
            <div
              className={`flex items-center gap-3 px-6 py-3 rounded-full font-medium text-white shadow-lg backdrop-blur-md transition-all duration-500 ${
                isAvatarTalking || isPlayingResponseRef.current
                  ? "bg-purple-600/70 border border-purple-400/40"
                  : isUserTalking
                    ? "bg-green-600/70 border border-green-400/40"
                    : "bg-white/10 border border-white/20"
              }`}
            >
              {/* Animated mic icon */}
              <div className="relative">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 19v3" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <rect x="9" y="2" width="6" height="13" rx="3" />
                </svg>
                {/* Muted slash overlay */}
                {(isMuted || isPlayingResponseRef.current) && mode !== "CUSTOM" && (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    className="absolute inset-0 text-red-400"
                  >
                    <path d="M2 2 22 22" />
                  </svg>
                )}
                {/* Pulsing ring when user is talking */}
                {isUserTalking && !isMuted && (
                  <span className="absolute -inset-1 rounded-full border-2 border-green-400 animate-ping opacity-75" />
                )}
              </div>
              <span className="text-sm">
                {isAvatarTalking || isPlayingResponseRef.current
                  ? "Avatar is speaking..."
                  : isUserTalking
                    ? "Listening..."
                    : "Ready to listen"}
              </span>
            </div>
          </div>
        )}
        <div className="absolute bottom-8 right-8 z-50">
          <button
            onClick={() => stopSession()}
            className="group relative flex items-center justify-center w-16 h-16 rounded-full bg-red-600 hover:bg-red-700 text-white shadow-lg transition-all duration-300 hover:scale-105 active:scale-95"
            aria-label="End Session"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
};

export const LiveAvatarSession: React.FC<{
  mode: SessionMode;
  sessionAccessToken: string;
  onSessionStopped: () => void;
  onStreamReady?: () => void;
  voiceChatConfig?: boolean | VoiceChatConfig;
  roomOptions?: RoomOptions;
  connectOptions?: RoomConnectOptions;
}> = ({
  mode,
  sessionAccessToken,
  onSessionStopped,
  onStreamReady,
  voiceChatConfig = true,
  roomOptions,
  connectOptions,
}) => {
    return (
      <LiveAvatarContextProvider
        sessionAccessToken={sessionAccessToken}
        voiceChatConfig={voiceChatConfig}
        roomOptions={roomOptions}
        connectOptions={connectOptions}
      >
        <LiveAvatarSessionComponent
          mode={mode}
          onSessionStopped={onSessionStopped}
          onStreamReady={onStreamReady}
        />
      </LiveAvatarContextProvider>
    );
  };
