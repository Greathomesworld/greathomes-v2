import { ProjectConsiderationRepository } from "@/src/domain/repositories/projectRepository";
import { ProjectConsiderationRepositoryPostgres } from "./postgres/projectConsiderationRepositoryPostgres";
import { ProjectConsiderationRepositoryMemory } from "./memory/projectConsiderationRepositoryMemory";

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

const g = globalThis as unknown as { __ghProjectConsiderationRepo?: ProjectConsiderationRepository };
if (!g.__ghProjectConsiderationRepo) {
  g.__ghProjectConsiderationRepo = usePostgres
    ? new ProjectConsiderationRepositoryPostgres()
    : new ProjectConsiderationRepositoryMemory();
}

export const projectConsiderationRepository: ProjectConsiderationRepository = g.__ghProjectConsiderationRepo;
