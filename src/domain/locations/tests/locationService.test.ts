import { LocationService } from "../services/locationService";
import { LocationRepositoryMemory } from "../../../infrastructure/repositories/memory/locationRepositoryMemory";

async function testLocationHierarchy() {
  const repo = new LocationRepositoryMemory();
  const service = new LocationService(repo);

  const state = await service.createLocation({
    name: "West Bengal",
    slug: "west-bengal",
    type: "STATE",
    status: "PUBLISHED",
    featured: false,
  });

  const city = await service.createLocation({
    name: "Kolkata",
    slug: "kolkata",
    type: "CITY",
    parentId: state.id,
    status: "PUBLISHED",
    featured: false,
  });

  console.assert(city.parentId === state.id, "Hierarchy link failed");

  try {
    await service.createLocation({
      name: "Invalid",
      slug: "invalid",
      type: "NEIGHBOURHOOD",
      parentId: state.id, // Invalid: State -> Neighbourhood
      status: "PUBLISHED",
      featured: false,
    });
    console.assert(false, "Invalid hierarchy should have failed");
  } catch (e) {
    console.log("Invalid hierarchy correctly rejected");
  }

  const path = await service.getLocationPath(city.id);
  console.assert(path.length === 2, "Path length mismatch");
  console.assert(path[0].slug === "west-bengal", "Path root mismatch");

  console.log("Location tests completed");
}

testLocationHierarchy();
