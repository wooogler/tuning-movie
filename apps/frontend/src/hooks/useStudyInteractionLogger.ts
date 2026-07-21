import { useCallback, useEffect, useRef } from 'react';
import { api, type StudyLogEventInput } from '../api/client';
import type { Stage, UISpec } from '../spec';
import type { Booking } from '../types';
import type { ChatMessage } from '../store/chatStore';
import type { StudySessionState } from '../study/sessionStorage';
import {
  consumePendingStudyLogEvents,
} from '../study/pendingInteractionEvents';
import {
  getWorkflowDirection,
  type InteractionLogSource,
} from '../study/loggingHeuristics';

interface UseStudyInteractionLoggerOptions {
  studySession?: StudySessionState | null;
  messages: ChatMessage[];
  activeSpec: UISpec | null;
  booking: Booking | null;
  error: string | null;
}

interface StageTransitionIntent {
  action: string;
  source: InteractionLogSource;
  reason?: string;
  triggerStage?: Stage | null;
  itemId?: string;
  itemIds?: string[];
}

interface UseStudyInteractionLoggerResult {
  loggingEnabled: boolean;
  logEvent: (type: string, payload: unknown) => void;
  logEventNow: (type: string, payload: unknown) => Promise<void>;
  setStageTransitionIntent: (intent: StageTransitionIntent | null) => void;
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
  const lastActiveStageRef = useRef<Stage | null>(null);
  const stageVisitCountRef = useRef<Partial<Record<Stage, number>>>({});
  const lastErrorRef = useRef<string | null>(null);
  const lastBookingIdRef = useRef<string | null>(null);
  const pendingStageTransitionIntentRef = useRef<StageTransitionIntent | null>(null);

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
    lastActiveStageRef.current = null;
    stageVisitCountRef.current = {};
    lastErrorRef.current = null;
    lastBookingIdRef.current = null;
    pendingStageTransitionIntentRef.current = null;
    queueRef.current = Promise.resolve();
    if (!loggingEnabled) return;
    const pendingEvents = consumePendingStudyLogEvents();
    if (pendingEvents.length === 0) return;
    void appendToQueue(pendingEvents.map((event) => event as StudyLogEventInput));
  }, [appendToQueue, loggingEnabled, studySession?.sessionId]);

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

    const previousStage = lastActiveStageRef.current;
    const events: StudyLogEventInput[] = [
      createLogEvent('chat.active_spec.updated', {
        stage: activeSpec.stage,
        spec: activeSpec,
      }),
    ];

    if (previousStage !== activeSpec.stage) {
      const transitionIntent = pendingStageTransitionIntentRef.current;
      const direction = getWorkflowDirection(previousStage, activeSpec.stage);
      const nextVisitIndex = (stageVisitCountRef.current[activeSpec.stage] ?? 0) + 1;
      stageVisitCountRef.current[activeSpec.stage] = nextVisitIndex;

      if (previousStage) {
        events.push(
          createLogEvent('workflow.transition', {
            fromStage: previousStage,
            toStage: activeSpec.stage,
            direction,
            source: transitionIntent?.source ?? 'system',
            action: transitionIntent?.action ?? 'auto',
            ...(transitionIntent?.reason ? { reason: transitionIntent.reason } : {}),
            ...(transitionIntent?.triggerStage ? { triggerStage: transitionIntent.triggerStage } : {}),
            ...(transitionIntent?.itemId ? { itemId: transitionIntent.itemId } : {}),
            ...(transitionIntent?.itemIds?.length ? { itemIds: transitionIntent.itemIds } : {}),
          })
        );
      }

      events.push(
        createLogEvent('stage.entered', {
          stage: activeSpec.stage,
          fromStage: previousStage,
          direction,
          visitIndex: nextVisitIndex,
          source: transitionIntent?.source ?? 'system',
          action: transitionIntent?.action ?? (previousStage ? 'auto' : 'initial'),
          ...(transitionIntent?.reason ? { reason: transitionIntent.reason } : {}),
          ...(transitionIntent?.triggerStage ? { triggerStage: transitionIntent.triggerStage } : {}),
        })
      );

      pendingStageTransitionIntentRef.current = null;
    }

    lastActiveStageRef.current = activeSpec.stage;
    enqueueEvents(events);
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
    setStageTransitionIntent: (intent) => {
      pendingStageTransitionIntentRef.current = intent;
    },
  };
}
