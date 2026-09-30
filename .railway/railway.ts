import { defineRailway, github, preserve, project, service } from "railway/iac";

// This repository manages only its own resources in the environment. Other
// repositories export their own partial name.
// See https://docs.railway.com/infrastructure-as-code#multi-repo-projects
export const partial = "stockpulse-dashboard";

export default defineRailway(() => {
  const stockpulse_dashboard = service("stockpulse-dashboard", {
    // Declared explicitly: without this a `railway config apply` treats the
    // GitHub connection as unmanaged and detaches it (killing auto-deploys).
    source: github("mako99/stockpulse-dashboard", { branch: "main" }),
    build: "npm run build",
    start: "npm start",
    healthcheck: "/api/health",
    healthcheckTimeout: 300,
    variables: {
      // preserve() keeps whatever value is already set, so the Twelve Data key
      // never has to live in the repo while still being declared here.
      TWELVEDATA_API_KEY: preserve()
    }
  });
  return project("stockpulse-dashboard", {
    resources: [stockpulse_dashboard],
  });
});
