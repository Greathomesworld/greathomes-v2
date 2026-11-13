import { ProjectConsiderationRepository } from "@/src/domain/repositories/projectRepository";
import {
  NewBookingAvailabilityRepository,
  NewBookingAvailabilityRepositoryMemory,
} from "@/src/domain/projects/repositories/newBookingRepository";
import { ProjectConsiderationRepositoryPostgres } from "./postgres/projectConsiderationRepositoryPostgres";
import { ProjectConsiderationRepositoryMemory } from "./memory/projectConsiderationRepositoryMemory";
import { NewBookingAvailabilityRepositoryPostgres } from "./postgres/newBookingRepositoryPostgres";

export {
  projectRepository,
  projectConfigurationRepository,
  projectMediaRepository,
  projectReraRepository,
  amenityRepository,
  projectFaqRepository,
  projectSeoRepository,
} from "./memory/projectRepositoryMemory";

const usePostgres = process.env.PERSISTENCE_PROVIDER === 'postgres';
if (usePostgres && !process.env.DATABASE_URL) {
  throw new Error('FATAL: PERSISTENCE_PROVIDER=postgres requires DATABASE_URL.');
}

const g = globalThis as unknown as {
  __ghProjectConsiderationRepo?: ProjectConsiderationRepository;
  __ghNewBookingAvailabilityRepo?: NewBookingAvailabilityRepository;
};
if (!g.__ghProjectConsiderationRepo) {
  g.__ghProjectConsiderationRepo = usePostgres
    ? new ProjectConsiderationRepositoryPostgres()
    : new ProjectConsiderationRepositoryMemory();
}
if (!g.__ghNewBookingAvailabilityRepo) {
  g.__ghNewBookingAvailabilityRepo = usePostgres
    ? new NewBookingAvailabilityRepositoryPostgres()
    : new NewBookingAvailabilityRepositoryMemory();
}

export const projectConsiderationRepository: ProjectConsiderationRepository = g.__ghProjectConsiderationRepo;
export const newBookingAvailabilityRepository: NewBookingAvailabilityRepository = g.__ghNewBookingAvailabilityRepo;

