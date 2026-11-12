"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
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
import { useLiveAvatarContext } from "../liveavatar/context";
import { SessionMode } from "./LiveAvatarDemo";

// Why a session ended. `error` is shown to the user; `retryable` tells the
// parent whether an automatic second attempt is worth making.
export type SessionEndInfo = {
  error?: string;
  retryable?: boolean;
};

// Once connected, how long to wait for the avatar's audio + video to arrive.
const STREAM_READY_TIMEOUT_MS = 15_000;
// Delay before re-opening the mic after the avatar stops (lets echo die down).
const UNMUTE_DELAY_MS = 800;
// Failsafe: if the avatar's audio has been silent this long while we still
// think it is talking, the "stopped speaking" event was missed.
const AVATAR_SILENCE_FAILSAFE_MS = 4_000;
// Failsafe of last resort when the audio level cannot be measured.
const AVATAR_TALKING_MAX_MS = 90_000;
const AUDIO_LEVEL_THRESHOLD = 0.02;
// How long the "Thinking..." status may stay up while waiting for a reply.
const AWAITING_REPLY_MAX_MS = 12_000;

// User-facing text for the reason the server gave for ending a session.
const describeEndReason = (reason: string | null): string => {
  switch (reason) {
    case "MAX_DURATION_REACHED":
      return "This session reached its time limit. Tap the mic to start a new one.";
    case "IDLE_TIMEOUT":
      return "The session ended because nobody was speaking. Tap the mic to start again.";
    case "NO_CREDITS":
      return "The avatar service is out of credits, so the session ended.";
    case "AVATAR_DELETED":
      return "This avatar is no longer available.";
    default:
      return "The session ended. Tap the mic to start again.";
  }
};

export const describeStartError = (err: unknown): SessionEndInfo => {
  const { name, message, status } = (err ?? {}) as {
    name?: string;
    message?: string;
    status?: number | null;
  };

  if (name === "NotAllowedError" || name === "SecurityError") {
    return {
      error:
        "Microphone access is blocked. Allow the microphone for this site and try again.",
      retryable: false,
    };
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return {
      error: "No microphone was found. Connect one and try again.",
      retryable: false,
    };
  }
  if (name === "NotReadableError") {
    return {
      error:
        "The microphone could not be opened. Close other apps using it and try again.",
      retryable: false,
    };
  }

  // A 4xx means the server refused this request (limits, credits, bad
  // config); asking again will not help. Timeouts and network errors might.
  const refused = typeof status === "number" && status >= 400 && status < 500;
  return {
    error: message
      ? `Could not start the session: ${message}`
      : "Could not start the session.",
    retryable: !refused,
  };
};

type AudioMeter = {
  ctx: AudioContext;
  analyser: AnalyserNode;
  samples: Uint8Array<ArrayBuffer>;
};

const createAudioMeter = (element: HTMLMediaElement): AudioMeter | null => {
  try {
    const stream = element.srcObject;
    if (!(stream instanceof MediaStream)) {
      return null;
    }
    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) {
      return null;
    }
    const AudioContextCtor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioContextCtor) {
      return null;
    }
    const ctx = new AudioContextCtor();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    // Analysis only: not connected to the speakers, the <video> plays audio.
    ctx.createMediaStreamSource(new MediaStream(audioTracks)).connect(analyser);
    return { ctx, analyser, samples: new Uint8Array(analyser.fftSize) };
  } catch (err) {
    console.warn("Avatar audio meter unavailable:", err);
    return null;
  }
};

// Peak level 0..1, or null when it cannot be measured right now.
const readAudioLevel = (meter: AudioMeter | null): number | null => {
  if (!meter || meter.ctx.state !== "running") {
    return null;
  }
  meter.analyser.getByteTimeDomainData(meter.samples);
  let peak = 0;
  for (const sample of meter.samples) {
    peak = Math.max(peak, Math.abs(sample - 128));
  }
  return peak / 128;
};

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
  onSessionEnded: (info: SessionEndInfo) => void;
  onStreamReady?: () => void;
}> = ({ mode, onSessionEnded, onStreamReady }) => {
  const [message, setMessage] = useState("");
  const {
    sessionState,
    isStreamReady,
    streamVersion,
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
  const unmuteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep a ref to voiceChat functions to avoid stale closures
  const voiceChatRef = useRef({ mute, unmute });
  voiceChatRef.current = { mute, unmute };

  const { resetAvatarTalking, sessionRef } = useLiveAvatarContext();

  // Parent callbacks are read through refs so a new function identity on a
  // parent re-render does not re-run the effects below.
  const onSessionEndedRef = useRef(onSessionEnded);
  onSessionEndedRef.current = onSessionEnded;
  const onStreamReadyRef = useRef(onStreamReady);
  onStreamReadyRef.current = onStreamReady;

  const startRequestedRef = useRef(false);
  const userStoppedRef = useRef(false);
  const endReportedRef = useRef(false);
  // True once start() has resolved. Until then a DISCONNECTED state belongs
  // to a failed start, which reports its own (more specific) error.
  const [startSettled, setStartSettled] = useState(false);
  // The browser refused to play the avatar's audio without a tap.
  const [audioBlocked, setAudioBlocked] = useState(false);
  const audioMeterRef = useRef<AudioMeter | null>(null);
  // True between the visitor finishing a sentence and the avatar starting
  // its reply. Shown as "Thinking..." so the visitor waits instead of
  // speaking again, which would interrupt the reply and restart it.
  const [awaitingReply, setAwaitingReply] = useState(false);
  const wasUserTalkingRef = useRef(false);

  useEffect(() => {
    if (isAvatarTalking || isUserTalking) {
      setAwaitingReply(false);
    } else if (wasUserTalkingRef.current) {
      setAwaitingReply(true);
    }
    wasUserTalkingRef.current = isUserTalking;
  }, [isUserTalking, isAvatarTalking]);

  useEffect(() => {
    if (!awaitingReply) {
      return;
    }
    const timer = setTimeout(
      () => setAwaitingReply(false),
      AWAITING_REPLY_MAX_MS,
    );
    return () => clearTimeout(timer);
  }, [awaitingReply]);

  // Tell the parent the session is over, exactly once.
  const reportEnd = useCallback((info: SessionEndInfo) => {
    if (endReportedRef.current) {
      return;
    }
    endReportedRef.current = true;
    onSessionEndedRef.current(info);
  }, []);

  // Start the session once, and surface the reason if it fails.
  useEffect(() => {
    if (sessionState !== SessionState.INACTIVE || startRequestedRef.current) {
      return;
    }
    startRequestedRef.current = true;
    startSession().then(
      () => setStartSettled(true),
      (err) => {
        console.error("LiveAvatar session failed to start:", err);
        reportEnd(describeStartError(err));
      },
    );
  }, [startSession, sessionState, reportEnd]);

  // The session ended after it had started.
  useEffect(() => {
    if (sessionState !== SessionState.DISCONNECTED || !startSettled) {
      return;
    }
    reportEnd(
      userStoppedRef.current
        ? {}
        : { error: describeEndReason(sessionRef.current.endReason) },
    );
  }, [sessionState, startSettled, reportEnd, sessionRef]);

  // Connected, but the avatar's audio/video never arrived: give up instead
  // of leaving the spinner up forever.
  useEffect(() => {
    if (sessionState !== SessionState.CONNECTED || isStreamReady) {
      return;
    }
    const timer = setTimeout(() => {
      console.error(
        `Avatar stream not ready after ${STREAM_READY_TIMEOUT_MS}ms; ending session`,
      );
      reportEnd({
        error: "The avatar took too long to appear. Please try again.",
        retryable: true,
      });
      void stopSession();
    }, STREAM_READY_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [sessionState, isStreamReady, stopSession, reportEnd]);

  // Attach the avatar's tracks to the <video>. `streamVersion` changes each
  // time the tracks are re-subscribed (e.g. after a network reconnect), so
  // the new tracks are attached too.
  useEffect(() => {
    const video = videoRef.current;
    if (!isStreamReady || !video) {
      return;
    }
    attachElement(video);
    onStreamReadyRef.current?.();

    // Start playback explicitly so a blocked autoplay is detected rather
    // than silently leaving the avatar frozen or mute.
    let cancelled = false;
    video.muted = false;
    video.play().then(
      () => {
        if (!cancelled) {
          setAudioBlocked(false);
        }
      },
      (err) => {
        if (cancelled || err?.name !== "NotAllowedError") {
          return;
        }
        // Sound needs a tap. Keep the picture moving in the meantime.
        video.muted = true;
        video.play().catch(() => {});
        setAudioBlocked(true);
      },
    );

    const meter = createAudioMeter(video);
    audioMeterRef.current = meter;

    return () => {
      cancelled = true;
      audioMeterRef.current = null;
      void meter?.ctx.close().catch(() => {});
    };
  }, [attachElement, isStreamReady, streamVersion]);

  const enableAudio = useCallback(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    video.muted = false;
    void audioMeterRef.current?.ctx.resume().catch(() => {});
    video.play().then(
      () => setAudioBlocked(false),
      (err) => console.warn("Could not enable avatar audio:", err),
    );
  }, []);

  // Keep-alive: ping HeyGen every 30 seconds to prevent session timeout
  useEffect(() => {
    if (sessionState !== SessionState.CONNECTED) return;

    const keepAliveInterval = setInterval(() => {
      keepAlive().catch((err) => {
        console.warn("Keep-alive ping failed (non-fatal):", err);
      });
    }, 30_000);

    return () => clearInterval(keepAliveInterval);
  }, [sessionState, keepAlive]);

  // Auto-mute when avatar is speaking to prevent interruption,
  // auto-unmute (with delay) when avatar finishes speaking.
  // NOTE: isMuted is intentionally NOT in the dependency array to prevent
  // re-trigger loops. We read the muted state directly from the ref.
  useEffect(() => {
    if (!isActive) return;

    if (isAvatarTalking) {
      // Clear any pending unmute timer
      if (unmuteTimerRef.current) {
        clearTimeout(unmuteTimerRef.current);
        unmuteTimerRef.current = null;
      }
      // Avatar started speaking - mute user mic to prevent echo/interruption
      voiceChatRef.current.mute();
      autoMutedRef.current = true;
    } else if (autoMutedRef.current) {
      // Avatar stopped speaking - wait 800ms for echo to dissipate,
      // then unmute so user can ask their next question
      unmuteTimerRef.current = setTimeout(() => {
        voiceChatRef.current.unmute();
        autoMutedRef.current = false;
        unmuteTimerRef.current = null;
      }, UNMUTE_DELAY_MS);
    }

    return () => {
      if (unmuteTimerRef.current) {
        clearTimeout(unmuteTimerRef.current);
        unmuteTimerRef.current = null;
      }
    };
  }, [isAvatarTalking, isActive]);

  // Failsafe for the auto-mute above. It depends on an "avatar stopped
  // speaking" event; if that event is lost the mic would stay muted for the
  // rest of the session. So while the avatar is marked as talking, watch its
  // actual audio: once it has spoken and then gone quiet for a while (or a
  // hard time limit passes), clear the talking flag, which unmutes the mic.
  useEffect(() => {
    if (!isActive || !isAvatarTalking) {
      return;
    }
    const startedAt = Date.now();
    let heardAvatar = false;
    let silentSince: number | null = null;

    const watchdog = setInterval(() => {
      const now = Date.now();
      const level = readAudioLevel(audioMeterRef.current);
      if (level !== null) {
        if (level > AUDIO_LEVEL_THRESHOLD) {
          heardAvatar = true;
          silentSince = null;
        } else if (heardAvatar && silentSince === null) {
          silentSince = now;
        }
      }
      const wentQuiet =
        silentSince !== null && now - silentSince > AVATAR_SILENCE_FAILSAFE_MS;
      const tooLong = now - startedAt > AVATAR_TALKING_MAX_MS;
      if (wentQuiet || tooLong) {
        console.warn(
          "Avatar stopped-speaking event not received; unmuting mic as a failsafe",
        );
        resetAvatarTalking();
      }
    }, 250);

    return () => clearInterval(watchdog);
  }, [isActive, isAvatarTalking, resetAvatarTalking]);

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
                    : awaitingReply
                      ? "bg-amber-600/70 border border-amber-400/40"
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
                    : awaitingReply
                      ? "Thinking... please wait"
                      : "Ready to listen"}
              </span>
            </div>
          </div>
        )}
        {audioBlocked && (
          <div className="absolute inset-0 z-50 flex items-center justify-center">
            <button
              onClick={enableAudio}
              className="px-6 py-3 rounded-full bg-white text-black font-medium shadow-lg"
            >
              Tap to enable sound
            </button>
          </div>
        )}
        <div className="absolute bottom-8 right-8 z-50">
          <button
            onClick={() => {
              userStoppedRef.current = true;
              void stopSession();
            }}
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
  onSessionEnded: (info: SessionEndInfo) => void;
  onStreamReady?: () => void;
  voiceChatConfig?: boolean | VoiceChatConfig;
  roomOptions?: RoomOptions;
  connectOptions?: RoomConnectOptions;
}> = ({
  mode,
  sessionAccessToken,
  onSessionEnded,
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
          onSessionEnded={onSessionEnded}
          onStreamReady={onStreamReady}
        />
      </LiveAvatarContextProvider>
    );
  };
