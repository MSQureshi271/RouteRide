/**
 * NotificationController — REST endpoints for in-app notifications and device registration.
 *
 * Endpoints:
 *  - GET    /notifications              List paginated notifications for current user
 *  - PATCH  /notifications/:id/read     Mark a single notification as read
 *  - GET    /notifications/unread-count Return unread notification count
 *  - POST   /notifications/fcm-token    Register/update FCM token
 *  - DELETE /notifications/fcm-token    Unregister FCM token on logout
 */
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { z } from "zod";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard.js";
import {
  CurrentUser,
  type JwtPayload,
} from "../common/decorators/current-user.decorator.js";
import { NotificationService } from "./notification.service.js";

const FcmTokenSchema = z
  .object({
    token: z.string().min(1, "Token must not be empty"),
  })
  .strict();

@Controller("notifications")
@UseGuards(JwtAuthGuard)
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get()
  async listNotifications(
    @CurrentUser() user: JwtPayload,
    @Query("page") pageQuery?: string,
    @Query("limit") limitQuery?: string,
  ) {
    const page = Math.max(1, parseInt(pageQuery || "1", 10) || 1);
    const limit = Math.min(
      100,
      Math.max(1, parseInt(limitQuery || "20", 10) || 20),
    );
    return this.notificationService.listForUser(user.sub, page, limit);
  }

  @Get("unread-count")
  async getUnreadCount(@CurrentUser() user: JwtPayload) {
    const count = await this.notificationService.getUnreadCount(user.sub);
    return { unreadCount: count };
  }

  @Patch(":id/read")
  async markRead(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.notificationService.markRead(user.sub, id);
  }

  @Post("fcm-token")
  @HttpCode(HttpStatus.NO_CONTENT)
  async registerFcmToken(
    @CurrentUser() user: JwtPayload,
    @Body() body: unknown,
  ): Promise<void> {
    const { token } = FcmTokenSchema.parse(body);
    await this.notificationService.registerFcmToken(user.sub, token);
  }

  @Delete("fcm-token")
  @HttpCode(HttpStatus.NO_CONTENT)
  async clearFcmToken(@CurrentUser() user: JwtPayload): Promise<void> {
    await this.notificationService.clearFcmToken(user.sub);
  }
}
