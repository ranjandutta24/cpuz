const express = require("express");
const si = require("systeminformation");

const app = express();
const PORT = 3000;

app.use(express.json());

// Allow CORS for all origins
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  next();
});

// ========== SSE Endpoint ==========
app.get("/stats", async (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const interval = setInterval(async () => {
    const cpu = await si.currentLoad();
    const mem = await si.mem();
    const disk = await si.fsSize();

    const data = {
      cpuUsage: cpu.currentLoad.toFixed(2),
      ramUsage: ((mem.active / mem.total) * 100).toFixed(2),
      totalRam: (mem.total / 1073741824).toFixed(2), // in GB
      diskUsage: ((disk[0].used / disk[0].size) * 100).toFixed(2),
    };

    res.write(`data: ${JSON.stringify(data)}\n\n`);
  }, 1000);

  // Handle client disconnect
  req.on("close", () => {
    clearInterval(interval);
    res.end();
  });
});

// ========== Info Endpoint ==========
app.get("/info", async (req, res) => {
  try {
    const cpu = await si.cpu();
    const mem = await si.mem();
    const disk = await si.fsSize();
    const osInfo = await si.osInfo();

    const info = {
      cpu: {
        manufacturer: cpu.manufacturer,
        brand: cpu.brand,
        cores: cpu.cores,
        speed: cpu.speed + " GHz",
      },
      ram: {
        total: (mem.total / 1073741824).toFixed(2) + " GB",
      },
      disk: {
        size: (disk[0].size / 1073741824).toFixed(2) + " GB",
        used: (disk[0].used / 1073741824).toFixed(2) + " GB",
      },
      os: {
        platform: osInfo.platform,
        distro: osInfo.distro,
        release: osInfo.release,
      },
    };

    res.status(200).json(info);
  } catch (err) {
    console.error("Error retrieving info:", err);
    res.status(500).send("Error fetching system info");
  }
});

// ========== Start Server ==========
app.listen(PORT, () => {
  console.log(`✅ Express server running at http://localhost:${PORT}`);
  console.log(`📊 SSE stream:   http://localhost:${PORT}/stats`);
  console.log(`ℹ️  Info route:   http://localhost:${PORT}/info`);
});
