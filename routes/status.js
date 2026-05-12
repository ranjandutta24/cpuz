const express = require("express");
const si = require("systeminformation");
const Stats = require("../models/Stats");
const os = require("os");

const router = express.Router();

// Get current system IP address
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const interfaceName in interfaces) {
    const addresses = interfaces[interfaceName];
    for (const address of addresses) {
      if (address.family === "IPv4" && !address.internal) {
        return address.address;
      }
    }
  }
  return "localhost";
}

const currentIP = getLocalIP();
console.log(`📊 Monitoring for IP: ${currentIP}`);

// Store the interval reference
let monitoringInterval = null;

// Function to collect and save stats
async function collectAndSaveStats() {
  try {
    // Collect stats
    const cpu = await si.currentLoad();
    const mem = await si.mem();
    const disk = await si.fsSize();

    const data = {
      cpuUsage: cpu.currentLoad.toFixed(2),
      ramUsage: ((mem.active / mem.total) * 100).toFixed(2),
      totalRam: (mem.total / 1073741824).toFixed(2), // in GB
      diskUsage: ((disk[0].used / disk[0].size) * 100).toFixed(2),
      timestamp: new Date(),
    };

    // Get the dynamic model for this IP
    const DynamicStats = Stats.getModelForIP(currentIP);

    // Save to MongoDB with dynamic collection name
    const stats = new DynamicStats(data);
    await stats.save();

    console.log(
      `✅ Stats saved for ${currentIP} at ${data.timestamp.toLocaleTimeString()}`,
    );
    // console.log(`   Collection: stats_${currentIP.replace(/\./g, "_")}`);
  } catch (err) {
    console.error("Error saving stats:", err);
  }
}

// Start monitoring automatically when this module is loaded
function startMonitoring() {
  if (!monitoringInterval) {
    console.log(`🚀 Starting automatic monitoring for IP: ${currentIP}`);
    console.log(`   Collection: stats_${currentIP.replace(/\./g, "_")}`);

    // Collect immediately
    collectAndSaveStats();

    // Then set up interval
    monitoringInterval = setInterval(collectAndSaveStats, 5000);
  }
}

// Stop monitoring function
function stopMonitoring() {
  if (monitoringInterval) {
    clearInterval(monitoringInterval);
    monitoringInterval = null;
    console.log("⏹️ Monitoring stopped");
  }
}

// Start monitoring automatically
startMonitoring();

// Routes for manual control
router.get("/", (req, res) => {
  res.status(200).json({
    message: "✅ Monitoring is running",
    ip: currentIP,
    interval: "5 seconds",
    collection: `stats_${currentIP.replace(/\./g, "_")}`,
    status: "automatic",
  });
});

router.get("/stop", (req, res) => {
  stopMonitoring();
  res.status(200).json({
    message: "⏹️ Monitoring stopped",
    ip: currentIP,
  });
});

router.get("/start", (req, res) => {
  startMonitoring();
  res.status(200).json({
    message: "🚀 Monitoring started",
    ip: currentIP,
  });
});

router.get("/status", (req, res) => {
  res.status(200).json({
    monitoring: monitoringInterval ? "running" : "stopped",
    ip: currentIP,
    collection: `stats_${currentIP.replace(/\./g, "_")}`,
    interval: "5 seconds",
    mode: "automatic",
  });
});

// Clean up interval when server stops
process.on("SIGINT", () => {
  stopMonitoring();
  console.log("🛑 Monitoring stopped due to server shutdown");
  process.exit(0);
});

module.exports = router;
