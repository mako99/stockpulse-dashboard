import { defineRailway, project, service } from "railway/iac";

// This repository manages only its own resources in the environment. Other
// repositories export their own partial name.
// See https://docs.railway.com/infrastructure-as-code#multi-repo-projects
export const partial = "stockpulse-dashboard";

export default defineRailway(() => {
  const stockpulse_dashboard = service("stockpulse-dashboard", {
    build: "npm run build",
    start: "npm start",
    healthcheck: "/api/health",
    healthcheckTimeout: 300,
    // builder from CaC: "RAILPACK"
  });
  return project("stockpulse-dashboard", {
    resources: [stockpulse_dashboard],
  });
});
