import { z } from "zod";
import { createSuccessEnvelopeSchema } from "../common/envelope.js";

export const NotificationSchema = z
  .object({
    id: z.string().uuid(),
    userId: z.string().uuid(),
    type: z.string(),
    title: z.string(),
    body: z.string(),
    data: z.record(z.string(), z.unknown()),
    isRead: z.boolean(),
    createdAt: z.string().datetime(),
  })
  .strict();

export const NotificationListResponseSchema = createSuccessEnvelopeSchema(
  z
    .object({
      notifications: z.array(NotificationSchema),
      unreadCount: z.number().int(),
    })
    .strict(),
);

export type Notification = z.infer<typeof NotificationSchema>;
