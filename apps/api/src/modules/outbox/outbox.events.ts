export const outboxEventTypes = {
  mediaObjectDeleteRequested: 'MEDIA_OBJECT_DELETE_REQUESTED',
} as const;

export type OutboxEventType = (typeof outboxEventTypes)[keyof typeof outboxEventTypes];
