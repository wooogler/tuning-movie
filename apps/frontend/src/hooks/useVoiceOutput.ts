import { useCallback, useEffect, useRef, useState } from 'react';

export type VoiceOutputStatus = 'off' | 'idle' | 'synthesizing' | 'playing' | 'error';

interface VoiceOutputQueueItem {
  id: string | null;
  text: string;
}

interface QueuedVoiceOutputItem {
  item: VoiceOutputQueueItem;
  controller: AbortController;
  audioBlobPromise: Promise<Blob>;
}

interface UseVoiceOutputOptions {
  enabled: boolean;
  synthesizeSpeech: (text: string, signal?: AbortSignal) => Promise<Blob>;
  onLogEvent?: (type: string, payload: unknown) => void;
  onActiveItemChange?: (item: VoiceOutputQueueItem | null) => void;
}

interface UseVoiceOutputResult {
  status: VoiceOutputStatus;
  error: string | null;
  isSpeaking: boolean;
  speak: (item: VoiceOutputQueueItem) => Promise<void>;
  stop: () => void;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  return 'Voice output failed.';
}

export function useVoiceOutput({
  enabled,
  synthesizeSpeech,
  onLogEvent,
  onActiveItemChange,
}: UseVoiceOutputOptions): UseVoiceOutputResult {
  const [status, setStatus] = useState<VoiceOutputStatus>(enabled ? 'idle' : 'off');
  const [error, setError] = useState<string | null>(null);
  const [queuedCount, setQueuedCount] = useState(0);

  const abortControllerRef = useRef<AbortController | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const queueRef = useRef<QueuedVoiceOutputItem[]>([]);
  const activeItemRef = useRef<VoiceOutputQueueItem | null>(null);
  const runningRef = useRef(false);
  const enabledRef = useRef(enabled);
  const synthesizeSpeechRef = useRef(synthesizeSpeech);
  const onLogEventRef = useRef(onLogEvent);
  const onActiveItemChangeRef = useRef(onActiveItemChange);
  const statusRef = useRef<VoiceOutputStatus>(enabled ? 'idle' : 'off');
  const errorRef = useRef<string | null>(null);

  const setStatusSafe = useCallback((nextStatus: VoiceOutputStatus) => {
    if (statusRef.current === nextStatus) return;
    statusRef.current = nextStatus;
    setStatus(nextStatus);
  }, []);

  const setErrorSafe = useCallback((nextError: string | null) => {
    if (errorRef.current === nextError) return;
    errorRef.current = nextError;
    setError(nextError);
  }, []);

  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  useEffect(() => {
    synthesizeSpeechRef.current = synthesizeSpeech;
  }, [synthesizeSpeech]);

  useEffect(() => {
    onLogEventRef.current = onLogEvent;
  }, [onLogEvent]);

  useEffect(() => {
    onActiveItemChangeRef.current = onActiveItemChange;
  }, [onActiveItemChange]);

  const setActiveItem = useCallback((nextItem: VoiceOutputQueueItem | null) => {
    const currentItem = activeItemRef.current;
    if (currentItem?.id === nextItem?.id && currentItem?.text === nextItem?.text) {
      return;
    }

    activeItemRef.current = nextItem;
    onActiveItemChangeRef.current?.(nextItem);
  }, []);

  const releasePlayback = useCallback(() => {
    const audio = audioRef.current;
    audioRef.current = null;
    if (audio) {
      audio.pause();
      audio.onended = null;
      audio.onerror = null;
      audio.src = '';
    }

    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  }, []);

  const clearQueue = useCallback(() => {
    for (const queuedItem of queueRef.current) {
      queuedItem.controller.abort();
    }
    queueRef.current = [];
    setQueuedCount(0);
  }, []);

  const stop = useCallback(() => {
    clearQueue();
    runningRef.current = false;
    const controller = abortControllerRef.current;
    abortControllerRef.current = null;
    if (controller) {
      controller.abort();
    }

    releasePlayback();
    setActiveItem(null);
    setErrorSafe(null);
    setStatusSafe(enabledRef.current ? 'idle' : 'off');
  }, [clearQueue, releasePlayback, setActiveItem, setErrorSafe, setStatusSafe]);

  useEffect(() => {
    if (enabled) {
      if (statusRef.current === 'off') {
        setStatusSafe('idle');
      }
      return;
    }

    stop();
    setErrorSafe(null);
    setStatusSafe('off');
  }, [enabled, setErrorSafe, setStatusSafe, stop]);

  useEffect(() => {
    return () => {
      stop();
    };
  }, [stop]);

  const playNext = useCallback(async () => {
    if (runningRef.current || !enabledRef.current) return;

    const nextQueuedItem = queueRef.current.shift();
    setQueuedCount(queueRef.current.length);
    if (!nextQueuedItem) {
      setActiveItem(null);
      setStatusSafe(enabledRef.current ? 'idle' : 'off');
      return;
    }

    const nextItem = nextQueuedItem.item;
    const nextText = nextItem.text;
    runningRef.current = true;
    setErrorSafe(null);
    setActiveItem(nextItem);
    setStatusSafe('synthesizing');

    const controller = nextQueuedItem.controller;
    abortControllerRef.current = controller;
    onLogEventRef.current?.('chat.voice_output.started', {
      textLength: nextText.length,
    });

    try {
      const audioBlob = await nextQueuedItem.audioBlobPromise;
      if (controller.signal.aborted || !enabledRef.current) {
        runningRef.current = false;
        abortControllerRef.current = null;
        setActiveItem(null);
        return;
      }

      const objectUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(objectUrl);
      objectUrlRef.current = objectUrl;
      audioRef.current = audio;

      audio.onended = () => {
        if (audioRef.current !== audio) return;
        releasePlayback();
        abortControllerRef.current = null;
        runningRef.current = false;
        setActiveItem(null);
        onLogEventRef.current?.('chat.voice_output.completed', {
          textLength: nextText.length,
        });
        void playNext();
      };

      audio.onerror = () => {
        if (audioRef.current !== audio) return;
        releasePlayback();
        abortControllerRef.current = null;
        runningRef.current = false;
        setActiveItem(null);
        const message = 'Audio playback failed.';
        setErrorSafe(message);
        setStatusSafe('error');
        onLogEventRef.current?.('chat.voice_output.error', {
          stage: 'playback',
          message,
        });
        void playNext();
      };

      setStatusSafe('playing');
      await audio.play();
    } catch (synthesisError) {
      if (controller.signal.aborted) {
        runningRef.current = false;
        abortControllerRef.current = null;
        setActiveItem(null);
        return;
      }
      releasePlayback();
      abortControllerRef.current = null;
      runningRef.current = false;
      setActiveItem(null);
      const message = toErrorMessage(synthesisError);
      setErrorSafe(message);
      setStatusSafe('error');
      onLogEventRef.current?.('chat.voice_output.error', {
        stage: 'synthesis',
        message,
      });
      void playNext();
    }
  }, [releasePlayback, setActiveItem, setErrorSafe, setStatusSafe]);

  const speak = useCallback(
    async (item: VoiceOutputQueueItem) => {
      const normalizedText = item.text.trim();
      if (!enabledRef.current || !normalizedText) return;

      const controller = new AbortController();
      const audioBlobPromise = synthesizeSpeechRef.current(normalizedText, controller.signal);
      void audioBlobPromise.catch(() => undefined);
      const queuedItem: QueuedVoiceOutputItem = {
        item: {
          ...item,
          text: normalizedText,
        },
        controller,
        audioBlobPromise,
      };

      queueRef.current.push(queuedItem);
      setQueuedCount(queueRef.current.length);
      void playNext();
    },
    [playNext]
  );

  return {
    status,
    error,
    isSpeaking: status === 'synthesizing' || status === 'playing' || queuedCount > 0,
    speak,
    stop,
  };
}
