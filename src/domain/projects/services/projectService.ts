import { Project } from "../entities";
import { ProjectRepository } from "../../repositories/projectRepository";
export {
  ProjectIntelligenceService,
  projectIntelligenceService,
  ValidationError,
  NotFoundError,
  DuplicateSlugError,
  DuplicateConfigurationError,
} from "./projectIntelligenceService";

export class ProjectService {
  constructor(private projectRepository: ProjectRepository) {}

  async createProject(data: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>): Promise<Project> {
    const existing = await this.projectRepository.findBySlug(data.slug);
    if (existing) throw new Error("Slug must be unique");

    return this.projectRepository.create(data);
  }

  async getProjectBySlug(slug: string): Promise<Project | null> {
    return this.projectRepository.findBySlug(slug);
  }
}
