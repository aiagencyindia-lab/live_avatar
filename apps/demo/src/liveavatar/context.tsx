import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  ConnectionQuality,
  LiveAvatarSession,
  SessionState,
  SessionEvent,
  VoiceChatEvent,
  VoiceChatState,
  AgentEventsEnum,
  VoiceChatConfig,
  RoomOptions,
  RoomConnectOptions,
} from "@heygen/liveavatar-web-sdk";
import { LiveAvatarSessionMessage } from "./types";
import { LIVEAVATAR_API_URL, stopSessionKeepalive } from "./stopSession";

type LiveAvatarContextProps = {
  sessionRef: React.RefObject<LiveAvatarSession>;

  isMuted: boolean;
  voiceChatState: VoiceChatState;

  sessionState: SessionState;
  isStreamReady: boolean;
  // Increments every time the avatar's tracks are (re)subscribed, so the UI
  // can re-attach them after a network reconnect.
  streamVersion: number;
  connectionQuality: ConnectionQuality;

  isUserTalking: boolean;
  isAvatarTalking: boolean;
  // Failsafe for a missed "avatar stopped speaking" event.
  resetAvatarTalking: () => void;

  messages: LiveAvatarSessionMessage[];
};

export const LiveAvatarContext = createContext<LiveAvatarContextProps>({
  sessionRef: {
    current: null,
  } as unknown as React.RefObject<LiveAvatarSession>,
  connectionQuality: ConnectionQuality.UNKNOWN,
  isMuted: true,
  voiceChatState: VoiceChatState.INACTIVE,
  sessionState: SessionState.DISCONNECTED,
  isStreamReady: false,
  streamVersion: 0,
  isUserTalking: false,
  isAvatarTalking: false,
  resetAvatarTalking: () => {},
  messages: [],
});

type LiveAvatarContextProviderProps = {
  children: React.ReactNode;
  sessionAccessToken: string;
  voiceChatConfig?: boolean | VoiceChatConfig;
  roomOptions?: RoomOptions;
  connectOptions?: RoomConnectOptions;
};

const useSessionState = (sessionRef: React.RefObject<LiveAvatarSession>) => {
  const [sessionState, setSessionState] = useState<SessionState>(
    sessionRef.current?.state || SessionState.INACTIVE,
  );
  const [connectionQuality, setConnectionQuality] = useState<ConnectionQuality>(
    sessionRef.current?.connectionQuality || ConnectionQuality.UNKNOWN,
  );
  const [isStreamReady, setIsStreamReady] = useState<boolean>(false);
  const [streamVersion, setStreamVersion] = useState(0);

  useEffect(() => {
    if (sessionRef.current) {
      sessionRef.current.on(SessionEvent.SESSION_STATE_CHANGED, (state) => {
        setSessionState(state);
        if (state === SessionState.DISCONNECTED) {
          sessionRef.current.removeAllListeners();
          sessionRef.current.voiceChat.removeAllListeners();
          setIsStreamReady(false);
        }
      });
      sessionRef.current.on(SessionEvent.SESSION_STREAM_READY, () => {
        setIsStreamReady(true);
        setStreamVersion((version) => version + 1);
      });
      sessionRef.current.on(
        SessionEvent.SESSION_CONNECTION_QUALITY_CHANGED,
        setConnectionQuality,
      );
    }
  }, [sessionRef]);

  return { sessionState, isStreamReady, streamVersion, connectionQuality };
};

const useVoiceChatState = (sessionRef: React.RefObject<LiveAvatarSession>) => {
  const [isMuted, setIsMuted] = useState(true);
  const [voiceChatState, setVoiceChatState] = useState<VoiceChatState>(
    sessionRef.current?.voiceChat.state || VoiceChatState.INACTIVE,
  );

  useEffect(() => {
    if (sessionRef.current) {
      sessionRef.current.voiceChat.on(VoiceChatEvent.MUTED, () => {
        setIsMuted(true);
      });
      sessionRef.current.voiceChat.on(VoiceChatEvent.UNMUTED, () => {
        setIsMuted(false);
      });
      sessionRef.current.voiceChat.on(
        VoiceChatEvent.STATE_CHANGED,
        setVoiceChatState,
      );
    }
  }, [sessionRef]);

  return { isMuted, voiceChatState };
};

const useTalkingState = (sessionRef: React.RefObject<LiveAvatarSession>) => {
  const [isUserTalking, setIsUserTalking] = useState(false);
  const [isAvatarTalking, setIsAvatarTalking] = useState(false);

  useEffect(() => {
    if (sessionRef.current) {
      sessionRef.current.on(AgentEventsEnum.USER_SPEAK_STARTED, () => {
        setIsUserTalking(true);
      });
      sessionRef.current.on(AgentEventsEnum.USER_SPEAK_ENDED, () => {
        setIsUserTalking(false);
      });
      sessionRef.current.on(AgentEventsEnum.AVATAR_SPEAK_STARTED, () => {
        setIsAvatarTalking(true);
      });
      sessionRef.current.on(AgentEventsEnum.AVATAR_SPEAK_ENDED, () => {
        setIsAvatarTalking(false);
      });
    }
  }, [sessionRef]);

  const resetAvatarTalking = useCallback(() => {
    setIsAvatarTalking(false);
  }, []);

  return { isUserTalking, isAvatarTalking, resetAvatarTalking };
};

// const useChatHistoryState = (
//   sessionRef: React.RefObject<LiveAvatarSession>
// ) => {
//   const [messages, setMessages] = useState<LiveAvatarSessionMessage[]>([]);
//   const currentSenderRef = useRef<MessageSender | null>(null);

//   // useEffect(() => {
//   //   if (sessionRef.current) {
//   //     const handleMessage = (
//   //       sender: MessageSender,
//   //       { task_id, message }: { task_id: string; message: string }
//   //     ) => {
//   //       if (currentSenderRef.current === sender) {
//   //         setMessages((prev) => [
//   //           ...prev.slice(0, -1),
//   //           {
//   //             ...prev[prev.length - 1]!,
//   //             message: [prev[prev.length - 1]!.message, message].join(""),
//   //           },
//   //         ]);
//   //       } else {
//   //         currentSenderRef.current = sender;
//   //         setMessages((prev) => [
//   //           ...prev,
//   //           {
//   //             id: task_id,
//   //             sender: sender,
//   //             message,
//   //             timestamp: Date.now(),
//   //           },
//   //         ]);
//   //       }
//   //     };

//   //     sessionRef.current.on(
//   //       AgentEventsEnum.USER_SPEAK_STARTED,
//   //       (data) => console.log("USER_SPEAK_STARTED", data)
//   //       handleMessage(MessageSender.USER, {
//   //   task_id: data.,
//   //   message: data.text || "",
//   // })
//   //     );
//   //   }
//   // }, [sessionRef]);

//   return { messages };
// };

export const LiveAvatarContextProvider = ({
  children,
  sessionAccessToken,
  voiceChatConfig = true,
  roomOptions,
  connectOptions,
}: LiveAvatarContextProviderProps) => {
  // Default voice chat on
  const config = {
    voiceChat: voiceChatConfig,
    apiUrl: LIVEAVATAR_API_URL,
    roomOptions,
    connectOptions,
  };
  const sessionRef = useRef<LiveAvatarSession>(
    new LiveAvatarSession(sessionAccessToken, config),
  );

  const { sessionState, isStreamReady, streamVersion, connectionQuality } =
    useSessionState(sessionRef);

  // End the session on the server when the tab is closed, refreshed or
  // navigated away from. Otherwise it keeps running (and keeps its slot)
  // until the server times it out.
  useEffect(() => {
    const onPageHide = () => {
      const session = sessionRef.current;
      if (
        session.state === SessionState.INACTIVE ||
        session.state === SessionState.DISCONNECTED
      ) {
        return;
      }
      stopSessionKeepalive(sessionAccessToken);
      void session.stop();
    };
    window.addEventListener("pagehide", onPageHide);
    return () => window.removeEventListener("pagehide", onPageHide);
  }, [sessionAccessToken]);

  const { isMuted, voiceChatState } = useVoiceChatState(sessionRef);
  const { isUserTalking, isAvatarTalking, resetAvatarTalking } =
    useTalkingState(sessionRef);
  // const { messages } = useChatHistoryState(sessionRef);

  return (
    <LiveAvatarContext.Provider
      value={{
        sessionRef,
        sessionState,
        isStreamReady,
        streamVersion,
        connectionQuality,
        isMuted,
        voiceChatState,
        isUserTalking,
        isAvatarTalking,
        resetAvatarTalking,
        messages: [], // TODO - properly implement chat history
      }}
    >
      {children}
    </LiveAvatarContext.Provider>
  );
};

export const useLiveAvatarContext = () => {
  return useContext(LiveAvatarContext);
};
