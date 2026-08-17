import { previewJobApp } from "../src/server.js";

// Preview routes long-running Package 3 work here. Production never redirects
// to this entrypoint, and the handler itself fails closed outside Preview.
export const maxDuration = 800;

export default previewJobApp;
