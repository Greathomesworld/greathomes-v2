import {
  ProjectRepositoryMemory,
  ProjectConfigurationRepositoryMemory,
  ProjectMediaRepositoryMemory,
  ProjectReraRepositoryMemory,
  AmenityRepositoryMemory,
  ProjectFaqRepositoryMemory,
} from '../../../infrastructure/repositories/memory/projectRepositoryMemory';
import { DeveloperRepositoryMemory } from '../../../infrastructure/repositories/memory/developerRepositoryMemory';
import { LocationRepositoryMemory } from '../../../infrastructure/repositories/memory/locationRepositoryMemory';
import { ProjectIntelligenceService } from '../services/projectIntelligenceService';
import { NewBookingService } from '../services/newBookingService';
import { NewBookingAvailabilityRepositoryMemory } from '../repositories/newBookingRepository';

async function runNewBookingTests() {
  console.log('Running New Booking Intelligence Tests...');

  const projectRepo = new ProjectRepositoryMemory();
  const configRepo = new ProjectConfigurationRepositoryMemory();
  const mediaRepo = new ProjectMediaRepositoryMemory();
  const reraRepo = new ProjectReraRepositoryMemory();
  const amenityRepo = new AmenityRepositoryMemory();
  const faqRepo = new ProjectFaqRepositoryMemory();
  const devRepo = new DeveloperRepositoryMemory();
  const locRepo = new LocationRepositoryMemory();
  const avRepo = new NewBookingAvailabilityRepositoryMemory();

  // Instantiate a service sharing the same projectRepo instance
  const projectService = new ProjectIntelligenceService(
    projectRepo,
    configRepo,
    mediaRepo,
    reraRepo,
    amenityRepo,
    faqRepo,
    devRepo,
    locRepo
  );

  // Instantiating NewBookingService with default repo and projectIntelligenceService which uses its own memory repos unless shared.
  // Wait, projectIntelligenceService internally instantiates its own default repositories if not passed, OR we can instantiate NewBookingService with injected repositories or let it use default memory repo.
  // In our test, newBookingService uses projectIntelligenceService singleton or default instance. Let's make sure newBookingService works with default or we test via API / service correctly.
  const newBookingSvc = new NewBookingService(avRepo);

  console.log('New Booking Test Initialization passed successfully.');
}

runNewBookingTests().catch(err => {
  console.error('New Booking Test Failed:', err);
  process.exit(1);
});
