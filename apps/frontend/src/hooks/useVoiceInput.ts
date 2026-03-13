import { useCallback, useEffect, useRef, useState } from 'react';

export type VoiceInputStatus =
  | 'off'
  | 'unsupported'
  | 'requesting-permission'
  | 'suspended'
  | 'listening'
  | 'capturing'
  | 'transcribing'
  | 'error';

interface UseVoiceInputOptions {
  enabled: boolean;
  suspended?: boolean;
  transcribeAudio: (audio: Blob) => Promise<string>;
  onTranscript: (payload: { text: string; durationMs: number }) => void;
  onLogEvent?: (type: string, payload: unknown) => void;
}

interface UseVoiceInputResult {
  supported: boolean;
  status: VoiceInputStatus;
  error: string | null;
}

const VOICE_START_THRESHOLD = 0.035;
const VOICE_START_HOLD_MS = 60;
const VOICE_FALSE_START_TIMEOUT_MS = 300;
const VOICE_SILENCE_HOLD_MS = 1_400;
const VOICE_MIN_CAPTURE_MS = 700;
const VOICE_MAX_CAPTURE_MS = 10_000;

type AudioContextConstructor = typeof AudioContext;

function getAudioContextConstructor(): AudioContextConstructor | null {
  if (typeof window === 'undefined') return null;
  const windowWithWebkit = window as Window & {
    webkitAudioContext?: AudioContextConstructor;
  };
  return window.AudioContext ?? windowWithWebkit.webkitAudioContext ?? null;
}

function isVoiceInputSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean(
    typeof navigator.mediaDevices?.getUserMedia === 'function' &&
      typeof MediaRecorder !== 'undefined' &&
      getAudioContextConstructor()
  );
}

function chooseRecorderMimeType(): string | null {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
    return null;
  }

  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
  ];

  for (const candidate of candidates) {
    if (MediaRecorder.isTypeSupported(candidate)) {
      return candidate;
    }
  }

  return null;
}

function measureAudioLevel(analyser: AnalyserNode, buffer: Uint8Array<ArrayBufferLike>): number {
  analyser.getByteTimeDomainData(buffer as Uint8Array<ArrayBuffer>);
  let sumSquares = 0;

  for (let index = 0; index < buffer.length; index += 1) {
    const centered = (buffer[index] - 128) / 128;
    sumSquares += centered * centered;
  }

  return Math.sqrt(sumSquares / buffer.length);
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  return 'Voice input failed.';
}

export function useVoiceInput({
  enabled,
  suspended = false,
  transcribeAudio,
  onTranscript,
  onLogEvent,
}: UseVoiceInputOptions): UseVoiceInputResult {
  const supported = isVoiceInputSupported();
  const [status, setStatus] = useState<VoiceInputStatus>(supported ? 'off' : 'unsupported');
  const [error, setError] = useState<string | null>(null);
  const [audioGraphReady, setAudioGraphReady] = useState(false);

  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioBufferRef = useRef<Uint8Array | null>(null);
  const mediaSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const captureStartedAtRef = useRef<number | null>(null);
  const lastVoiceAtRef = useRef<number | null>(null);
  const speechCandidateStartedAtRef = useRef<number | null>(null);
  const speechConfirmedRef = useRef(false);
  const discardCaptureRef = useRef(false);
  const transcribingRef = useRef(false);
  const statusRef = useRef<VoiceInputStatus>(supported ? 'off' : 'unsupported');
  const errorRef = useRef<string | null>(null);
  const enabledRef = useRef(enabled);
  const suspendedRef = useRef(suspended);
  const transcribeAudioRef = useRef(transcribeAudio);
  const onTranscriptRef = useRef(onTranscript);
  const onLogEventRef = useRef(onLogEvent);

  const setStatusSafe = useCallback((nextStatus: VoiceInputStatus) => {
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
    suspendedRef.current = suspended;
  }, [suspended]);

  useEffect(() => {
    transcribeAudioRef.current = transcribeAudio;
  }, [transcribeAudio]);

  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  }, [onTranscript]);

  useEffect(() => {
    onLogEventRef.current = onLogEvent;
  }, [onLogEvent]);

  const cancelAnalysisLoop = useCallback(() => {
    if (rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const stopRecorder = useCallback((discardCapture: boolean) => {
    discardCaptureRef.current = discardCapture;
    speechCandidateStartedAtRef.current = null;
    speechConfirmedRef.current = false;

    const recorder = recorderRef.current;
    if (!recorder || recorder.state === 'inactive') {
      captureStartedAtRef.current = null;
      lastVoiceAtRef.current = null;
      return;
    }
    recorder.stop();
  }, []);

  const cleanupAudioResources = useCallback(async () => {
    cancelAnalysisLoop();
    stopRecorder(true);
    setAudioGraphReady(false);

    const source = mediaSourceRef.current;
    mediaSourceRef.current = null;
    if (source) {
      source.disconnect();
    }

    analyserRef.current = null;
    audioBufferRef.current = null;

    const stream = streamRef.current;
    streamRef.current = null;
    if (stream) {
      for (const track of stream.getTracks()) {
        track.stop();
      }
    }

    const audioContext = audioContextRef.current;
    audioContextRef.current = null;
    if (audioContext && audioContext.state !== 'closed') {
      await audioContext.close().catch(() => undefined);
    }
  }, [cancelAnalysisLoop, stopRecorder]);

  useEffect(() => {
    return () => {
      void cleanupAudioResources();
    };
  }, [cleanupAudioResources]);

  useEffect(() => {
    if (!supported) {
      setStatusSafe('unsupported');
      setErrorSafe('Voice mode is not supported in this browser.');
      return;
    }

    if (!enabled) {
      setErrorSafe(null);
      setStatusSafe('off');
      void cleanupAudioResources();
      return;
    }

    let cancelled = false;

    const setupVoiceInput = async () => {
      if (streamRef.current) {
        if (!transcribingRef.current) {
          setStatusSafe(suspendedRef.current ? 'suspended' : 'listening');
        }
        return;
      }

      setErrorSafe(null);
      setStatusSafe('requesting-permission');

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
        if (cancelled || !enabledRef.current) {
          for (const track of stream.getTracks()) {
            track.stop();
          }
          return;
        }

        const AudioContextCtor = getAudioContextConstructor();
        if (!AudioContextCtor) {
          for (const track of stream.getTracks()) {
            track.stop();
          }
          throw new Error('Voice mode is not supported in this browser.');
        }

        const audioContext = new AudioContextCtor();
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 2048;
        analyser.smoothingTimeConstant = 0.15;

        const source = audioContext.createMediaStreamSource(stream);
        source.connect(analyser);

        if (audioContext.state === 'suspended') {
          await audioContext.resume().catch(() => undefined);
        }

        streamRef.current = stream;
        audioContextRef.current = audioContext;
        analyserRef.current = analyser;
        mediaSourceRef.current = source;
        audioBufferRef.current = new Uint8Array(analyser.fftSize);
        setAudioGraphReady(true);
        setStatusSafe(suspendedRef.current ? 'suspended' : 'listening');
      } catch (setupError) {
        const message = toErrorMessage(setupError);
        setErrorSafe(message);
        setStatusSafe('error');
        onLogEventRef.current?.('chat.voice_input.error', {
          stage: 'permission',
          message,
        });
      }
    };

    void setupVoiceInput();

    return () => {
      cancelled = true;
    };
  }, [cleanupAudioResources, enabled, setErrorSafe, setStatusSafe, supported]);

  useEffect(() => {
    if (
      !supported ||
      !enabled ||
      !audioGraphReady ||
      !streamRef.current ||
      !analyserRef.current ||
      !audioBufferRef.current
    ) {
      cancelAnalysisLoop();
      return;
    }

    const analyser = analyserRef.current;
    const audioLevelBuffer = audioBufferRef.current;

    const transcribeCapturedAudio = async (audio: Blob, durationMs: number) => {
      transcribingRef.current = true;
      setStatusSafe('transcribing');
      onLogEventRef.current?.('chat.voice_input.captured', {
        durationMs,
        mimeType: audio.type || null,
        sizeBytes: audio.size,
      });

      try {
        const transcript = await transcribeAudioRef.current(audio);
        const normalizedTranscript = transcript.trim();
        setErrorSafe(null);
        onLogEventRef.current?.('chat.voice_input.transcribed', {
          durationMs,
          hasText: Boolean(normalizedTranscript),
          textLength: normalizedTranscript.length,
        });
        if (normalizedTranscript) {
          onTranscriptRef.current({
            text: normalizedTranscript,
            durationMs,
          });
        }
      } catch (transcriptionError) {
        const message = toErrorMessage(transcriptionError);
        setErrorSafe(message);
        onLogEventRef.current?.('chat.voice_input.error', {
          stage: 'transcription',
          message,
        });
      } finally {
        transcribingRef.current = false;
        if (!enabledRef.current) {
          setStatusSafe('off');
          return;
        }
        setStatusSafe(suspendedRef.current ? 'suspended' : 'listening');
      }
    };

    const startCapture = (startedAt: number) => {
      const stream = streamRef.current;
      if (!stream || transcribingRef.current) return;

      const recorderMimeType = chooseRecorderMimeType();
      const recorder = recorderMimeType
        ? new MediaRecorder(stream, { mimeType: recorderMimeType })
        : new MediaRecorder(stream);

      chunksRef.current = [];
      discardCaptureRef.current = false;
      recorderRef.current = recorder;
      captureStartedAtRef.current = startedAt;
      lastVoiceAtRef.current = startedAt;
      speechCandidateStartedAtRef.current = startedAt;
      speechConfirmedRef.current = false;
      setStatusSafe('capturing');
      onLogEventRef.current?.('chat.voice_input.started', {
        mimeType: recorder.mimeType || recorderMimeType || null,
      });

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const recordedChunks = chunksRef.current;
        const captureStartedAt = captureStartedAtRef.current;
        const durationMs =
          captureStartedAt !== null ? Math.max(0, performance.now() - captureStartedAt) : 0;

        recorderRef.current = null;
        chunksRef.current = [];
        captureStartedAtRef.current = null;
        lastVoiceAtRef.current = null;

        if (discardCaptureRef.current || recordedChunks.length === 0) {
          discardCaptureRef.current = false;
          if (!transcribingRef.current) {
            setStatusSafe(suspendedRef.current ? 'suspended' : 'listening');
          }
          return;
        }

        discardCaptureRef.current = false;
        const audio = new Blob(recordedChunks, {
          type: recorder.mimeType || recorderMimeType || 'audio/webm',
        });
        void transcribeCapturedAudio(audio, durationMs);
      };

      recorder.start(250);
    };

    const analyzeAudio = () => {
      if (!enabledRef.current) return;

      if (transcribingRef.current) {
        rafRef.current = window.requestAnimationFrame(analyzeAudio);
        return;
      }

      if (suspendedRef.current) {
        if (recorderRef.current && recorderRef.current.state !== 'inactive') {
          stopRecorder(true);
        } else {
          setStatusSafe('suspended');
        }
        rafRef.current = window.requestAnimationFrame(analyzeAudio);
        return;
      }

      const now = performance.now();
      const level = measureAudioLevel(analyser, audioLevelBuffer);
      const recorder = recorderRef.current;

      if (recorder && recorder.state !== 'inactive') {
        if (level >= VOICE_START_THRESHOLD) {
          lastVoiceAtRef.current = now;
          const candidateStartedAt = speechCandidateStartedAtRef.current ?? now;
          if (!speechConfirmedRef.current && now - candidateStartedAt >= VOICE_START_HOLD_MS) {
            speechConfirmedRef.current = true;
          }
        }

        const captureStartedAt = captureStartedAtRef.current ?? now;
        const captureDurationMs = now - captureStartedAt;
        const silenceDurationMs =
          lastVoiceAtRef.current === null ? 0 : now - lastVoiceAtRef.current;

        if (!speechConfirmedRef.current) {
          const candidateStartedAt = speechCandidateStartedAtRef.current ?? captureStartedAt;
          if (
            level < VOICE_START_THRESHOLD &&
            now - candidateStartedAt >= VOICE_FALSE_START_TIMEOUT_MS
          ) {
            stopRecorder(true);
          }

          rafRef.current = window.requestAnimationFrame(analyzeAudio);
          return;
        }

        if (captureDurationMs >= VOICE_MAX_CAPTURE_MS) {
          stopRecorder(false);
        } else if (
          captureDurationMs >= VOICE_MIN_CAPTURE_MS &&
          silenceDurationMs >= VOICE_SILENCE_HOLD_MS
        ) {
          stopRecorder(false);
        }

        rafRef.current = window.requestAnimationFrame(analyzeAudio);
        return;
      }

      if (level >= VOICE_START_THRESHOLD) {
        if (speechCandidateStartedAtRef.current === null) {
          speechCandidateStartedAtRef.current = now;
          startCapture(now);
        }
      } else {
        speechCandidateStartedAtRef.current = null;
      }

      setStatusSafe('listening');
      rafRef.current = window.requestAnimationFrame(analyzeAudio);
    };

    setStatusSafe(suspended ? 'suspended' : 'listening');
    rafRef.current = window.requestAnimationFrame(analyzeAudio);

    return () => {
      cancelAnalysisLoop();
    };
  }, [
    cancelAnalysisLoop,
    enabled,
    audioGraphReady,
    setErrorSafe,
    setStatusSafe,
    stopRecorder,
    suspended,
    supported,
  ]);

  return {
    supported,
    status,
    error,
  };
}
