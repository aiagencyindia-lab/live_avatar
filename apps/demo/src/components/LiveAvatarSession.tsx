"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  LiveAvatarContextProvider,
  useSession,
  useTextChat,
  useVoiceChat,
} from "../liveavatar";
import {
  SessionState,
  VoiceChatConfig,
  RoomOptions,
  RoomConnectOptions,
} from "@heygen/liveavatar-web-sdk";
import { useAvatarActions } from "../liveavatar/useAvatarActions";
import { SessionMode } from "./LiveAvatarDemo";

const Button: React.FC<{
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}> = ({ onClick, disabled, children }) => {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="bg-white text-black px-4 py-2 rounded-md"
    >
      {children}
    </button>
  );
};

const LiveAvatarSessionComponent: React.FC<{
  mode: SessionMode;
  onSessionStopped: () => void;
  onStreamReady?: () => void;
}> = ({ mode, onSessionStopped, onStreamReady }) => {
  const [message, setMessage] = useState("");
  const {
    sessionState,
    isStreamReady,
    startSession,
    stopSession,
    connectionQuality,
    keepAlive,
    attachElement,
  } = useSession();
  const {
    isAvatarTalking,
    isUserTalking,
    isMuted,
    isActive,
    isLoading,
    start,
    stop,
    mute,
    unmute,
  } = useVoiceChat();

  // For useAvatarActions, treat FULL_PTT as FULL since they share the same API
  const avatarActionsMode = mode === "FULL_PTT" ? "FULL" : mode;
  const { interrupt, repeat, startListening, stopListening } =
    useAvatarActions(avatarActionsMode);

  // For useTextChat, treat FULL_PTT as FULL since they share the same API
  const textChatMode = mode === "FULL_PTT" ? "FULL" : mode;
  const { sendMessage } = useTextChat(textChatMode);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Track whether we auto-muted (so we don't override manual mute)
  const autoMutedRef = useRef(false);

  useEffect(() => {
    if (sessionState === SessionState.DISCONNECTED) {
      onSessionStopped();
    }
  }, [sessionState, onSessionStopped]);

  useEffect(() => {
    if (isStreamReady && videoRef.current) {
      attachElement(videoRef.current);
      onStreamReady?.(); // Notify parent that stream is ready
    }
  }, [attachElement, isStreamReady, onStreamReady]);

  useEffect(() => {
    if (sessionState === SessionState.INACTIVE) {
      startSession();
    }
  }, [startSession, sessionState]);

  // Auto-mute when avatar is speaking to prevent interruption,
  // auto-unmute when avatar finishes speaking
  useEffect(() => {
    if (!isActive) return;

    if (isAvatarTalking) {
      // Avatar started speaking - mute user mic to prevent interruption
      if (!isMuted) {
        mute();
        autoMutedRef.current = true;
      }
    } else {
      // Avatar stopped speaking - unmute user mic so they can ask next question
      if (autoMutedRef.current && isMuted) {
        unmute();
        autoMutedRef.current = false;
      }
    }
  }, [isAvatarTalking, isActive, isMuted, mute, unmute]);

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
        {isActive && (
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-50">
            <div
              className={`flex items-center gap-3 px-6 py-3 rounded-full font-medium text-white shadow-lg backdrop-blur-md transition-all duration-500 ${
                isAvatarTalking
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
                {isMuted && (
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
                {isAvatarTalking
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
