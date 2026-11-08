import { notificationRepository, customerPreferenceRepository } from '../repositories/index.ts';
import { Notification, NotificationDto } from '../entities.ts';
import { getDb } from '../../../db/client.ts';
import { alertDeliveryAttempts } from '../../../db/schema.ts';
import { eq, and } from 'drizzle-orm';

export class NotificationService {
  async getNotifications(customerId: string, options?: { unreadOnly?: boolean; limit?: number; offset?: number }): Promise<NotificationDto[]> {
    const limit = Math.min(options?.limit || 20, 50);
    const offset = options?.offset || 0;
    const isRead = options?.unreadOnly ? false : undefined;
    
    const notifications = await notificationRepository.listByCustomer(customerId, {
      limit,
      offset,
      isRead,
    });
    
    return notifications.map(this.mapToDto);
  }

  async getUnreadCountDisplay(customerId: string): Promise<string> {
    const count = await notificationRepository.getUnreadCount(customerId);
    if (count > 9) return '9+';
    return count.toString();
  }

  async markAsRead(id: string, customerId: string): Promise<boolean> {
    return await notificationRepository.markAsRead(id, customerId);
  }

  async markAllAsRead(customerId: string): Promise<boolean> {
    return await notificationRepository.markAllAsRead(customerId);
  }

  async deleteNotification(id: string, customerId: string): Promise<boolean> {
    return await notificationRepository.delete(id, customerId);
  }

  async pruneNotifications(customerId: string, daysRetention = 90): Promise<number> {
    return await notificationRepository.prune(customerId, daysRetention);
  }

  async createNotification(data: Omit<Notification, 'id' | 'createdAt' | 'isRead'> & { id?: string; isRead?: boolean }): Promise<Notification> {
    // 1. Create In-App Notification
    const notif = await notificationRepository.create(data);

    // 2. Fetch Customer Preferences to check alert delivery channels
    const prefs = await customerPreferenceRepository.findByCustomerId(data.customerId);
    const inAppEnabled = prefs?.inAppAlertsEnabled ?? true;
    const emailEnabled = prefs?.emailAlertsEnabled ?? true;

    // 3. Log In-App delivery attempt
    await this.logDeliveryAttempt(notif.id, 'IN_APP', inAppEnabled ? 'SENT' : 'FAILED', inAppEnabled ? null : 'In-app notifications disabled in preferences');

    // 4. Attempt Email delivery
    if (emailEnabled) {
      try {
        await this.deliverEmail(notif);
      } catch (err: any) {
        await this.logDeliveryAttempt(notif.id, 'EMAIL', 'FAILED', err?.message || 'Email delivery failed');
      }
    } else {
      await this.logDeliveryAttempt(notif.id, 'EMAIL', 'FAILED', 'Email notifications disabled in preferences');
    }

    return notif;
  }

  private async logDeliveryAttempt(notificationId: string, channel: 'IN_APP' | 'EMAIL', status: 'PENDING' | 'SENT' | 'FAILED', failureReason?: string | null): Promise<void> {
    const db = getDb();
    if (!db) return;
    try {
      const id = `dlv_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      await db.insert(alertDeliveryAttempts).values({
        id,
        notificationId,
        channel,
        status,
        attempts: 1,
        lastAttemptAt: new Date(),
        failureReason: failureReason || null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);
    } catch (err) {
      console.warn('Failed to log alert delivery attempt:', err);
    }
  }

  private async deliverEmail(notification: Notification): Promise<void> {
    // Email delivery foundation
    const isEmailConfigured = Boolean(process.env.EMAIL_SMTP_HOST || process.env.SENDGRID_API_KEY);
    
    if (!isEmailConfigured) {
      // Return dev/no-op log state without claiming SUCCESS. We log PENDING or FAILED.
      throw new Error('Email provider not configured (EMAIL_SMTP_HOST or SENDGRID_API_KEY missing)');
    }

    // Real email provider delivery would go here.
    // For now, since no production credentials exist, we fail or log cleanly depending on env configuration.
    // The spec rules: "Do NOT silently pretend an email was sent. Production configuration must fail clearly."
    throw new Error('Email provider configuration invalid or offline');
  }

  private mapToDto(notif: Notification): NotificationDto {
    return {
      id: notif.id,
      type: notif.type,
      title: notif.title,
      message: notif.message,
      resourceType: notif.resourceType,
      resourceId: notif.resourceId,
      projectId: notif.projectId || null,
      locationId: notif.locationId || null,
      isRead: notif.isRead,
      createdAt: notif.createdAt.toISOString(),
      metadata: notif.metadata || null,
    };
  }
}

export const notificationService = new NotificationService();
