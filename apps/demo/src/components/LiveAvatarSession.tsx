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
    startPushToTalk,
    stopPushToTalk,
  } = useVoiceChat();

  // For useAvatarActions, treat FULL_PTT as FULL since they share the same API
  const avatarActionsMode = mode === "FULL_PTT" ? "FULL" : mode;
  const { interrupt, repeat, startListening, stopListening } =
    useAvatarActions(avatarActionsMode);

  // For useTextChat, treat FULL_PTT as FULL since they share the same API
  const textChatMode = mode === "FULL_PTT" ? "FULL" : mode;
  const { sendMessage } = useTextChat(textChatMode);
  const videoRef = useRef<HTMLVideoElement>(null);

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

  const VoiceChatComponents = (
    <>
      <p>Voice Chat Active: {isActive ? "true" : "false"}</p>
      <p>Voice Chat Loading: {isLoading ? "true" : "false"}</p>
      {isActive && <p>Muted: {isMuted ? "true" : "false"}</p>}
      <Button
        onClick={() => {
          if (isActive) {
            stop();
          } else {
            start();
          }
        }}
        disabled={isLoading}
      >
        {isActive ? "Stop Voice Chat" : "Start Voice Chat"}
      </Button>
      {isActive && (
        <Button
          onClick={() => {
            if (isMuted) {
              unmute();
            } else {
              mute();
            }
          }}
        >
          {isMuted ? "Unmute" : "Mute"}
        </Button>
      )}
      <div className="flex flex-row items-center justify-center gap-4">
        <Button onClick={startListening}>Start Listening</Button>
        <Button onClick={stopListening}>Stop Listening</Button>
      </div>
    </>
  );

  const PushToTalkComponents = (
    <div className="flex flex-row items-center justify-center gap-4">
      <Button
        onClick={() => {
          startListening();
          startPushToTalk();
        }}
      >
        Start Push to Talk
      </Button>
      <Button
        onClick={() => {
          stopPushToTalk();
          stopListening();
        }}
      >
        Stop Push to Talk
      </Button>
    </div>
  );

  return (
    <div className="w-full h-full flex flex-col items-center justify-center bg-black relative">
      <div className="absolute inset-0 w-full h-full flex flex-col items-center justify-center">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          className="w-full h-full object-contain"
        />
        {/* Controls Overlay */}
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

      {/* Hidden container for necessary elements? No, standard HTML video element is enough. 
          The debug info is removed. 
      */}
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
