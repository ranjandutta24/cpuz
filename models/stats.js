const mongoose = require("mongoose");

const StatsSchema = new mongoose.Schema(
  {
    cpuUsage: String,
    ramUsage: String,
    totalRam: String,
    diskUsage: String,
    timestamp: { type: Date, default: Date.now },
  },
  {
    // This will be overridden by the dynamic collection name
    collection: "stats",
  }
);

// Create a base model
const Stats = mongoose.model("Stats", StatsSchema);

// Function to get a model for a specific IP
Stats.getModelForIP = function (ip) {
  const collectionName = `stats_${ip.replace(/\./g, "_")}`;

  // Check if model already exists
  if (mongoose.models[collectionName]) {
    return mongoose.models[collectionName];
  }

  // Create a new model with the dynamic collection name
  return mongoose.model(collectionName, StatsSchema, collectionName);
};

module.exports = Stats;
