import { getDb } from '../../../db/client.ts';
import {
  CustomerRepository,
  SavedItemRepository,
  RecentlyViewedRepository,
  CustomerPreferenceRepository,
  ProjectWatchRepository,
  LocationWatchRepository,
  NotificationRepository,
} from './customerRepository.ts';
import {
  InMemoryCustomerRepository,
  InMemorySavedItemRepository,
  InMemoryRecentlyViewedRepository,
  InMemoryCustomerPreferenceRepository,
  InMemoryProjectWatchRepository,
  InMemoryLocationWatchRepository,
  InMemoryNotificationRepository,
} from './inMemoryCustomerRepository.ts';
import {
  CustomerRepositoryPostgres,
  SavedItemRepositoryPostgres,
  RecentlyViewedRepositoryPostgres,
  CustomerPreferenceRepositoryPostgres,
  ProjectWatchRepositoryPostgres,
  LocationWatchRepositoryPostgres,
  NotificationRepositoryPostgres,
} from '../../../../src/infrastructure/repositories/postgres/customerRepositoryPostgres.ts';

function shouldUsePostgres(): boolean {
  if (process.env.PERSISTENCE_PROVIDER === 'memory') return false;
  if (process.env.PERSISTENCE_PROVIDER === 'postgres') return Boolean(getDb());
  return Boolean(getDb());
}

function createDualRepo<T extends object>(pgInstance: T, memInstance: T): T {
  return new Proxy({} as T, {
    get(_target, prop, receiver) {
      const active = shouldUsePostgres() ? pgInstance : memInstance;
      const value = Reflect.get(active, prop, receiver);
      return typeof value === 'function' ? value.bind(active) : value;
    },
  });
}

export const customerRepository: CustomerRepository = createDualRepo<CustomerRepository>(
  new CustomerRepositoryPostgres(),
  new InMemoryCustomerRepository()
);

export const savedItemRepository: SavedItemRepository = createDualRepo<SavedItemRepository>(
  new SavedItemRepositoryPostgres(),
  new InMemorySavedItemRepository()
);

export const recentlyViewedRepository: RecentlyViewedRepository = createDualRepo<RecentlyViewedRepository>(
  new RecentlyViewedRepositoryPostgres(),
  new InMemoryRecentlyViewedRepository()
);

export const customerPreferenceRepository: CustomerPreferenceRepository = createDualRepo<CustomerPreferenceRepository>(
  new CustomerPreferenceRepositoryPostgres(),
  new InMemoryCustomerPreferenceRepository()
);

export const projectWatchRepository: ProjectWatchRepository = createDualRepo<ProjectWatchRepository>(
  new ProjectWatchRepositoryPostgres(),
  new InMemoryProjectWatchRepository()
);

export const locationWatchRepository: LocationWatchRepository = createDualRepo<LocationWatchRepository>(
  new LocationWatchRepositoryPostgres(),
  new InMemoryLocationWatchRepository()
);

export const notificationRepository: NotificationRepository = createDualRepo<NotificationRepository>(
  new NotificationRepositoryPostgres(),
  new InMemoryNotificationRepository()
);

