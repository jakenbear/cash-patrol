import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Hourly so each owner's local midnight is captured on the next tick.
crons.interval("snapshot account balances", { hours: 1 }, internal.snapshots.captureDue);

export default crons;
