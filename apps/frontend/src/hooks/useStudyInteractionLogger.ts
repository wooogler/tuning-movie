import { useCallback, useEffect, useRef } from 'react';
import { api, type StudyLogEventInput } from '../api/client';
import type { UISpec } from '../spec';
import type { Booking } from '../types';
import type { ChatMessage } from '../store/chatStore';
import type { StudySessionState } from '../study/sessionStorage';

interface UseStudyInteractionLoggerOptions {
  studySession?: StudySessionState | null;
  messages: ChatMessage[];
  activeSpec: UISpec | null;
  booking: Booking | null;
  error: string | null;
}

interface UseStudyInteractionLoggerResult {
  loggingEnabled: boolean;
  logEvent: (type: string, payload: unknown) => void;
  logEventNow: (type: string, payload: unknown) => Promise<void>;
}

function createLogEvent(type: string, payload: unknown): StudyLogEventInput {
  return {
    type,
    payload,
    clientTimestamp: new Date().toISOString(),
  };
}

export function useStudyInteractionLogger({
  studySession,
  messages,
  activeSpec,
  booking,
  error,
}: UseStudyInteractionLoggerOptions): UseStudyInteractionLoggerResult {
  const loggingEnabled = Boolean(studySession?.interactionLogFile?.trim());
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const lastMessageCountRef = useRef(0);
  const lastActiveSpecSignatureRef = useRef<string | null>(null);
  const lastErrorRef = useRef<string | null>(null);
  const lastBookingIdRef = useRef<string | null>(null);

  const writeEvents = useCallback(
    async (events: StudyLogEventInput[]) => {
      if (!loggingEnabled || !studySession?.studyToken || events.length === 0) return;
      await api.logStudyEvents(events, studySession.studyToken);
    },
    [loggingEnabled, studySession]
  );

  const appendToQueue = useCallback(
    async (events: StudyLogEventInput[]) => {
      queueRef.current = queueRef.current
        .catch(() => undefined)
        .then(async () => {
          await writeEvents(events);
        });
      try {
        await queueRef.current;
      } catch (requestError) {
        console.error('Failed to write study interaction logs:', requestError);
      }
    },
    [writeEvents]
  );

  const enqueueEvents = useCallback(
    (events: StudyLogEventInput[]) => {
      if (events.length === 0) return;
      void appendToQueue(events);
    },
    [appendToQueue]
  );

  const logEvent = useCallback(
    (type: string, payload: unknown) => {
      enqueueEvents([createLogEvent(type, payload)]);
    },
    [enqueueEvents]
  );

  const logEventNow = useCallback(
    async (type: string, payload: unknown) => {
      await appendToQueue([createLogEvent(type, payload)]);
    },
    [appendToQueue]
  );

  useEffect(() => {
    lastMessageCountRef.current = 0;
    lastActiveSpecSignatureRef.current = null;
    lastErrorRef.current = null;
    lastBookingIdRef.current = null;
    queueRef.current = Promise.resolve();
  }, [studySession?.sessionId]);

  useEffect(() => {
    if (!loggingEnabled) return;
    if (messages.length < lastMessageCountRef.current) {
      lastMessageCountRef.current = 0;
    }

    const events = messages
      .slice(lastMessageCountRef.current)
      .map((message) => createLogEvent('chat.message.rendered', { message }));
    lastMessageCountRef.current = messages.length;
    enqueueEvents(events);
  }, [enqueueEvents, loggingEnabled, messages]);

  useEffect(() => {
    if (!loggingEnabled) return;

    const signature = activeSpec ? JSON.stringify(activeSpec) : null;
    if (signature === lastActiveSpecSignatureRef.current) return;
    lastActiveSpecSignatureRef.current = signature;
    if (!activeSpec) return;

    enqueueEvents([
      createLogEvent('chat.active_spec.updated', {
        stage: activeSpec.stage,
        spec: activeSpec,
      }),
    ]);
  }, [activeSpec, enqueueEvents, loggingEnabled]);

  useEffect(() => {
    if (!loggingEnabled) return;
    if (!error) {
      lastErrorRef.current = null;
      return;
    }
    if (error === lastErrorRef.current) return;
    lastErrorRef.current = error;
    enqueueEvents([
      createLogEvent('chat.error.displayed', {
        message: error,
      }),
    ]);
  }, [enqueueEvents, error, loggingEnabled]);

  useEffect(() => {
    if (!loggingEnabled) return;
    if (!booking) {
      lastBookingIdRef.current = null;
      return;
    }
    if (booking.id === lastBookingIdRef.current) return;
    lastBookingIdRef.current = booking.id;
    enqueueEvents([
      createLogEvent('booking.completed', {
        booking,
      }),
    ]);
  }, [booking, enqueueEvents, loggingEnabled]);

  return {
    loggingEnabled,
    logEvent,
    logEventNow,
  };
}
