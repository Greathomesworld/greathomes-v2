import {
  projectWatchRepository,
  locationWatchRepository,
  savedItemRepository,
  customerPreferenceRepository,
  customerRepository,
  notificationRepository,
} from '../repositories/index.ts';
import { notificationService } from './notificationService.ts';
import { NotificationType, Notification, CustomerPreferences } from '../entities.ts';
import { getDb } from '../../../db/client.ts';
import { eq, and, sql } from 'drizzle-orm';
import { projects, locations, notifications, savedItems } from '../../../db/schema.ts';

export interface AlertEvent {
  type: NotificationType;
  resourceType: 'PROJECT' | 'RESALE_LISTING' | 'RENTAL_LISTING' | 'LOCATION';
  resourceId: string;
  previousValue: string | number | null;
  newValue: string | number | null;
  projectId?: string | null;
  locationId?: string | null;
  changeFingerprint: string;
}

export class AlertEvaluationService {
  /**
   * Main entrypoint to process an alert event.
   * Matches affected watchers/savers, applies preference filters, deduplicates, and creates notifications.
   */
  async evaluateEvent(event: AlertEvent): Promise<number> {
    const db = getDb();
    if (!db) return 0;

    // 1. Identify all potentially interested customers
    const interestedCustomerIds = new Set<string>();

    // Query project watchers
    if (event.resourceType === 'PROJECT') {
      const pWatches = await projectWatchRepository.listByProject(event.resourceId);
      pWatches.forEach(w => interestedCustomerIds.add(w.customerId));
      
      // Also query saved project items
      const savedItemsRows = await db.select().from(savedItems).where(
        and(
          eq(savedItems.resourceType, 'PROJECT'),
          eq(savedItems.resourceId, event.resourceId)
        )
      );
      savedItemsRows.forEach(r => interestedCustomerIds.add(r.customerId));
    }

    // Query location watchers (for new launch/project added in a location)
    if (event.resourceType === 'LOCATION' || event.locationId) {
      const locId = event.locationId || event.resourceId;
      const lWatches = await locationWatchRepository.listByLocation(locId);
      lWatches.forEach(w => interestedCustomerIds.add(w.customerId));

      // Also support descendant locations (e.g. watching parent location notifies for sub-locations)
      const parentLoc = await db.select().from(locations).where(eq(locations.id, locId)).limit(1);
      if (parentLoc[0]?.parentId) {
        const parentWatches = await locationWatchRepository.listByLocation(parentLoc[0].parentId);
        parentWatches.forEach(w => interestedCustomerIds.add(w.customerId));
      }
    }

    // Query resale/rental saved items
    if (event.resourceType === 'RESALE_LISTING' || event.resourceType === 'RENTAL_LISTING') {
      const savedRows = await db.select().from(savedItems).where(
        and(
          eq(savedItems.resourceType, event.resourceType),
          eq(savedItems.resourceId, event.resourceId)
        )
      );
      savedRows.forEach(r => interestedCustomerIds.add(r.customerId));
    }

    let alertCount = 0;

    // 2. Evaluate eligibility, preferences, and deduplication for each interested customer
    for (const customerId of interestedCustomerIds) {
      try {
        const customer = await customerRepository.findById(customerId);
        if (!customer || customer.status !== 'ACTIVE') {
          continue; // Disabled/deleted customers get no alerts
        }

        const prefs = await customerPreferenceRepository.findByCustomerId(customerId);
        if (!this.isPreferenceEnabled(event.type, prefs)) {
          continue; // Filtered by customer preference
        }

        // 3. Deduplicate checks using metadata changeFingerprint
        const isDuplicate = await this.checkDeduplication(customerId, event);
        if (isDuplicate) {
          continue; // Duplicate suppression
        }

        // 4. Generate & Deliver Notification
        await notificationService.createNotification({
          customerId,
          type: event.type,
          title: this.generateAlertTitle(event),
          message: this.generateAlertMessage(event),
          resourceType: event.resourceType,
          resourceId: event.resourceId,
          projectId: event.projectId || (event.resourceType === 'PROJECT' ? event.resourceId : null),
          locationId: event.locationId || (event.resourceType === 'LOCATION' ? event.resourceId : null),
          metadata: {
            previousValue: event.previousValue,
            newValue: event.newValue,
            changeFingerprint: event.changeFingerprint,
          },
        });

        alertCount++;
      } catch (err) {
        console.warn(`Failed to process alert for customer ${customerId}:`, err);
      }
    }

    return alertCount;
  }

  private isPreferenceEnabled(type: NotificationType, prefs: CustomerPreferences | null): boolean {
    if (!prefs) return true; // Default to true if preferences are missing

    switch (type) {
      case 'PROJECT_STATUS_CHANGED':
        return prefs.projectStatusAlerts ?? true;
      case 'PROJECT_RERA_VERIFIED':
      case 'PROJECT_RERA_STATUS_CHANGED':
        return prefs.reraAlerts ?? true;
      case 'PROJECT_PRICE_CHANGED':
        return prefs.priceChangeAlerts ?? true;
      case 'PROJECT_CONFIGURATION_ADDED':
      case 'PROJECT_CONFIGURATION_UPDATED':
        return prefs.configurationAlerts ?? true;
      case 'PROJECT_POSSESSION_UPDATED':
      case 'PROJECT_INFORMATION_UPDATED':
        return prefs.projectStatusAlerts ?? true;
      case 'NEW_PROJECT_IN_WATCHED_LOCATION':
      case 'NEW_LAUNCH_IN_WATCHED_LOCATION':
        return prefs.locationAlerts ?? true;
      case 'RESALE_PRICE_CHANGED':
      case 'RESALE_STATUS_CHANGED':
        return prefs.resaleAlerts ?? true;
      case 'RENT_PRICE_CHANGED':
      case 'RENT_STATUS_CHANGED':
        return prefs.rentalAlerts ?? true;
      case 'LISTING_BECAME_UNAVAILABLE':
        return prefs.resaleAlerts ?? prefs.rentalAlerts ?? true;
      default:
        return true;
    }
  }

  private async checkDeduplication(customerId: string, event: AlertEvent): Promise<boolean> {
    const db = getDb();
    if (!db) return false;

    // A duplicate event with the same fingerprint must not create another notification.
    // Query notifications for this customer, type, resourceId, and fingerprint.
    const duplicateRows = await db.select().from(notifications).where(
      and(
        eq(notifications.customerId, customerId),
        eq(notifications.type, event.type),
        eq(notifications.resourceId, event.resourceId),
        sql`${notifications.metadata}->>'changeFingerprint' = ${event.changeFingerprint}`
      )
    );

    return duplicateRows.length > 0;
  }

  private generateAlertTitle(event: AlertEvent): string {
    switch (event.type) {
      case 'PROJECT_STATUS_CHANGED':
        return 'Project status changed';
      case 'PROJECT_RERA_VERIFIED':
        return 'RERA verification completed';
      case 'PROJECT_RERA_STATUS_CHANGED':
        return 'RERA status updated';
      case 'PROJECT_PRICE_CHANGED':
        return 'Starting price changed';
      case 'PROJECT_CONFIGURATION_ADDED':
        return 'New configuration added';
      case 'PROJECT_CONFIGURATION_UPDATED':
        return 'Configuration pricing updated';
      case 'NEW_PROJECT_IN_WATCHED_LOCATION':
        return 'New project launched in watched location';
      case 'NEW_LAUNCH_IN_WATCHED_LOCATION':
        return 'New launch in watched location';
      case 'RESALE_PRICE_CHANGED':
        return 'Saved home price changed';
      case 'RENT_PRICE_CHANGED':
        return 'Saved rental price changed';
      case 'LISTING_BECAME_UNAVAILABLE':
        return 'Saved opportunity no longer available';
      default:
        return 'Property update';
    }
  }

  private generateAlertMessage(event: AlertEvent): string {
    const prev = event.previousValue;
    const curr = event.newValue;

    switch (event.type) {
      case 'PROJECT_STATUS_CHANGED':
        return `Project has moved from ${prev} to ${curr}.`;
      case 'PROJECT_RERA_VERIFIED':
        return 'RERA verification has been completed and verified by our auditing team.';
      case 'PROJECT_PRICE_CHANGED':
        return `Starting price has changed from ₹${this.formatCurrency(prev)} to ₹${this.formatCurrency(curr)}.`;
      case 'PROJECT_CONFIGURATION_ADDED':
        return `A new ${curr} configuration is now available for discovery.`;
      case 'PROJECT_CONFIGURATION_UPDATED':
        return `Configuration details and pricing have been updated.`;
      case 'NEW_PROJECT_IN_WATCHED_LOCATION':
        return `A new premium project has been added in your watched location.`;
      case 'NEW_LAUNCH_IN_WATCHED_LOCATION':
        return `A new launch project is now available in your watched location.`;
      case 'RESALE_PRICE_CHANGED':
        return `Asking price updated from ₹${this.formatCurrency(prev)} to ₹${this.formatCurrency(curr)}.`;
      case 'RENT_PRICE_CHANGED':
        return `Monthly rent updated from ₹${this.formatCurrency(prev)} to ₹${this.formatCurrency(curr)}.`;
      case 'LISTING_BECAME_UNAVAILABLE':
        return 'This saved property listing is no longer available on the market.';
      default:
        return 'An update has been made to a property you are watching.';
    }
  }

  private formatCurrency(val: any): string {
    if (!val) return '0';
    const num = Number(val);
    if (isNaN(num)) return val.toString();
    if (num >= 10000000) {
      return `${(num / 10000000).toFixed(2)} Cr`;
    }
    if (num >= 100000) {
      return `${(num / 100000).toFixed(2)} Lakh`;
    }
    return num.toLocaleString();
  }
}

export const alertEvaluationService = new AlertEvaluationService();

export class PropertyChangeDetectionService {
  /**
   * Compares the previous state vs the new state of a project and detects meaningful buyer-facing changes.
   */
  detectProjectChanges(before: any, after: any): AlertEvent[] {
    const events: AlertEvent[] = [];
    if (!before || !after) return events;

    // Status transition
    if (before.status !== after.status) {
      events.push({
        type: 'PROJECT_STATUS_CHANGED',
        resourceType: 'PROJECT',
        resourceId: after.id,
        previousValue: before.status,
        newValue: after.status,
        changeFingerprint: `status_${before.status}_${after.status}`,
      });
    }

    // Price change
    if (Number(before.startingPrice) !== Number(after.startingPrice)) {
      events.push({
        type: 'PROJECT_PRICE_CHANGED',
        resourceType: 'PROJECT',
        resourceId: after.id,
        previousValue: before.startingPrice,
        newValue: after.startingPrice,
        changeFingerprint: `price_${before.startingPrice}_${after.startingPrice}`,
      });
    }

    return events;
  }

  detectReraChanges(before: any, after: any): AlertEvent[] {
    const events: AlertEvent[] = [];
    if (!before || !after) return events;

    if (before.status !== after.status && after.status === 'VERIFIED') {
      events.push({
        type: 'PROJECT_RERA_VERIFIED',
        resourceType: 'PROJECT',
        resourceId: after.projectId,
        previousValue: before.status,
        newValue: after.status,
        changeFingerprint: `rera_verified_${before.status}_${after.status}`,
      });
    }
    return events;
  }

  detectResaleChanges(before: any, after: any): AlertEvent[] {
    const events: AlertEvent[] = [];
    if (!before || !after) return events;

    if (Number(before.askingPrice) !== Number(after.askingPrice)) {
      events.push({
        type: 'RESALE_PRICE_CHANGED',
        resourceType: 'RESALE_LISTING',
        resourceId: after.id,
        previousValue: before.askingPrice,
        newValue: after.askingPrice,
        changeFingerprint: `resale_price_${before.askingPrice}_${after.askingPrice}`,
      });
    }

    if (before.lifecycleStatus !== after.lifecycleStatus && after.lifecycleStatus === 'UNAVAILABLE') {
      events.push({
        type: 'LISTING_BECAME_UNAVAILABLE',
        resourceType: 'RESALE_LISTING',
        resourceId: after.id,
        previousValue: before.lifecycleStatus,
        newValue: after.lifecycleStatus,
        changeFingerprint: `resale_unavailable_${before.lifecycleStatus}_${after.lifecycleStatus}`,
      });
    }

    return events;
  }

  detectRentalChanges(before: any, after: any): AlertEvent[] {
    const events: AlertEvent[] = [];
    if (!before || !after) return events;

    if (Number(before.monthlyRent) !== Number(after.monthlyRent)) {
      events.push({
        type: 'RENT_PRICE_CHANGED',
        resourceType: 'RENTAL_LISTING',
        resourceId: after.id,
        previousValue: before.monthlyRent,
        newValue: after.monthlyRent,
        changeFingerprint: `rent_price_${before.monthlyRent}_${after.monthlyRent}`,
      });
    }

    if (before.lifecycleStatus !== after.lifecycleStatus && after.lifecycleStatus === 'UNAVAILABLE') {
      events.push({
        type: 'LISTING_BECAME_UNAVAILABLE',
        resourceType: 'RENTAL_LISTING',
        resourceId: after.id,
        previousValue: before.lifecycleStatus,
        newValue: after.lifecycleStatus,
        changeFingerprint: `rent_unavailable_${before.lifecycleStatus}_${after.lifecycleStatus}`,
      });
    }

    return events;
  }
}

export const propertyChangeDetectionService = new PropertyChangeDetectionService();
