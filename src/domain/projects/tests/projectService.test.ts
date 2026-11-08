import { ProjectService } from "../services/projectService";
import { ProjectRepositoryMemory } from "../../../infrastructure/repositories/memory/projectRepositoryMemory";

async function testProjectCreation() {
  const repo = new ProjectRepositoryMemory();
  const service = new ProjectService(repo);

  const project = await service.createProject({
    developerId: "dev-1",
    locationId: "loc-1",
    name: "Merlin Rise",
    slug: "merlin-rise",
    status: "NEW_LAUNCH",
    propertyType: "APARTMENT",
  });

  console.assert(project.name === "Merlin Rise", "Project name mismatch");
  console.assert(project.id !== undefined, "ID should be generated");

  try {
    await service.createProject({
      developerId: "dev-1",
      locationId: "loc-1",
      name: "Merlin Rise Duplicate",
      slug: "merlin-rise", // Duplicate slug
      status: "NEW_LAUNCH",
      propertyType: "APARTMENT",
    });
    console.assert(false, "Duplicate slug should have failed");
  } catch (e) {
    console.log("Duplicate slug correctly rejected");
  }

  console.log("Tests completed");
}

testProjectCreation();
