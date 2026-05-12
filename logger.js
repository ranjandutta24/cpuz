const express = require("express");
const si = require("systeminformation");
const mongoose = require("mongoose");

const router = express.Router();
// Allow CORS for all origins

// ========== SSE Endpoint ==========
router.get("/stats", async (req, res) => {
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
router.get("/info", async (req, res) => {
  try {
    const cpu = await si.cpu();
    const mem = await si.mem();
    const disk = await si.fsSize();
    const osInfo = await si.osInfo();
    const gpus = await si.graphics();

    const gpu = gpus.controllers[0]; // first GPU

    const info = {
      cpu: {
        manufacturer: cpu.manufacturer,
        brand: cpu.brand,
        cores: cpu.cores,
        speed: cpu.speed + " GHz",
      },
      gpu: {
        model: gpu?.model,
        vendor: gpu?.vendor,
        vramMB: gpu?.vram,
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

// ========== Detail Endpoint (Running Applications) ==========
router.get("/detail", async (req, res) => {
  try {
    const processes = await si.processes();

    // Sort by CPU usage and take top 20
    const topProcesses = processes.list
      .sort((a, b) => b.cpu - a.cpu)
      .slice(0, 20)
      .map((p) => ({
        pid: p.pid,
        name: p.name,
        cpu: p.cpu.toFixed(2) + " %",
        memory: p.mem.toFixed(2) + " %",
        user: p.user,
        started: p.started,
      }));

    res.status(200).json({
      totalProcesses: processes.all,
      runningProcesses: processes.running,
      topProcesses: topProcesses,
    });
  } catch (err) {
    console.error("Error retrieving process details:", err);
    res.status(500).send("Error fetching process details");
  }
});

// ========== Real-time Detail Endpoint (Structured for Mobile) ==========
router.get("/detail/live", async (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  console.log("📱 Mobile client connected to /detail/live");

  const interval = setInterval(async () => {
    try {
      const processes = await si.processes();

      const topProcesses = processes.list
        .sort((a, b) => b.cpu - a.cpu)
        .slice(0, 15)
        .map((p) => ({
          pid: p.pid,
          name: p.name,
          cpuPercent: Number(p.cpu.toFixed(2)),
          memoryPercent: Number(p.mem.toFixed(2)),
          memoryMB: Number((p.memRss / 1024 / 1024).toFixed(2)),
          user: p.user,
          started: p.started,
        }));

      const payload = {
        timestamp: Date.now(),

        system: {
          totalProcesses: processes.all,
          runningProcesses: processes.running,
          blockedProcesses: processes.blocked,
        },

        processes: topProcesses,
      };

      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    } catch (err) {
      console.error("Detail stream error:", err);
    }
  }, 2000); // every 2 seconds

  req.on("close", () => {
    console.log("📴 Mobile client disconnected");
    clearInterval(interval);
    res.end();
  });
});

// ========== Unified Real-time Monitoring ==========
router.get("/monitor/live", async (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  console.log("📡 Client connected to /monitor/live");

  // Safe initialization
  let prevNetwork = [];
  let prevDisk = { rBytes: 0, wBytes: 0 };

  const interval = setInterval(async () => {
    try {
      const [cpuTemp, network, diskIO, gpu, services, processes, mem, load] =
        await Promise.all([
          si.cpuTemperature(),
          si.networkStats(),
          si.disksIO(),
          si.graphics(),
          si.services("*"),
          si.processes(),
          si.mem(),
          si.currentLoad(),
        ]);

      // ===== Network Speed =====
      const netSpeed = (network || []).map((iface, i) => {
        const prev = prevNetwork[i] || {
          rx_bytes: 0,
          tx_bytes: 0,
        };

        return {
          interface: iface.iface,
          rxBytes: iface.rx_bytes || 0,
          txBytes: iface.tx_bytes || 0,
          rxRate: ((iface.rx_bytes || 0) - prev.rx_bytes) / 2,
          txRate: ((iface.tx_bytes || 0) - prev.tx_bytes) / 2,
        };
      });

      prevNetwork = network || prevNetwork;

      // ===== Disk IO Rate (NULL SAFE) =====
      let readRate = 0;
      let writeRate = 0;

      if (diskIO && prevDisk) {
        readRate = ((diskIO.rBytes || 0) - prevDisk.rBytes) / 2;

        writeRate = ((diskIO.wBytes || 0) - prevDisk.wBytes) / 2;

        prevDisk = diskIO;
      }

      // ===== Top Processes =====
      const topProcesses = (processes.list || [])
        .sort((a, b) => b.cpu - a.cpu)
        .slice(0, 10)
        .map((p) => ({
          pid: p.pid,
          name: p.name,
          cpu: Number(p.cpu.toFixed(2)),
          memory: Number(p.mem.toFixed(2)),
        }));

      // ===== Services =====
      const importantServices = (services || []).slice(0, 10).map((s) => ({
        name: s.name,
        running: s.running,
      }));

      // ===== GPU =====
      const gpuData = (gpu.controllers || []).map((g) => ({
        model: g.model,
        vendor: g.vendor,
        vramMB: g.vram,
      }));

      // ===== Final Payload =====
      const payload = {
        timestamp: Date.now(),

        cpu: {
          usage: Number((load.currentLoad || 0).toFixed(2)),
          temperature: cpuTemp?.main ?? null,
        },

        memory: {
          totalGB: Number((mem.total / 1073741824).toFixed(2)),
          usedPercent: Number(((mem.used / mem.total) * 100).toFixed(2)),
        },

        network: netSpeed,

        diskIO: {
          readBytesPerSec: readRate,
          writeBytesPerSec: writeRate,
        },

        gpu: gpuData,

        services: importantServices,

        processes: topProcesses,
      };

      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    } catch (err) {
      console.error("Monitor stream error:", err);
    }
  }, 2000);

  req.on("close", () => {
    console.log("📴 Client disconnected");
    clearInterval(interval);
    res.end();
  });
});

module.exports = router;

// let data = {
//   timestamp: 1774605669353,
//   cpu: { usage: 50.23, temperature: null },
//   memory: { totalGB: 15.87, usedPercent: 52.75 },
//   network: [
//     {
//       interface: "WiFi",
//       rxBytes: 200548340,
//       txBytes: 57556410,
//       rxRate: 8012.5,
//       txRate: 13887,
//     },
//   ],
//   diskIO: { readBytesPerSec: 0, writeBytesPerSec: 0 },
//   gpu: [
//     {
//       model: "AMD Radeon RX 6600",
//       vendor: "Advanced Micro Devices, Inc.",
//       vramMB: 8176,
//     },
//   ],
//   services: [
//     { name: "adpsvc", running: false },
//     { name: "agent_ovpnconnect", running: true },
//     { name: "alg", running: false },
//     { name: "amd crash defender service", running: true },
//     { name: "amd external events utility", running: true },
//     { name: "appidsvc", running: false },
//     { name: "appinfo", running: true },
//     { name: "appmgmt", running: false },
//     { name: "appreadiness", running: false },
//     { name: "appvclient", running: false },
//   ],
//   processes: [
//     { pid: 0, name: "System Idle Process", cpu: 87.32, memory: 0 },
//     { pid: 5420, name: "MsMpEng.exe", cpu: 4.89, memory: 1.74 },
//     { pid: 9248, name: "msedge.exe", cpu: 3, memory: 1.76 },
//     { pid: 4, name: "System", cpu: 2.11, memory: 0 },
//     { pid: 3300, name: "svchost.exe", cpu: 1.45, memory: 0.16 },
//     { pid: 12240, name: "Taskmgr.exe", cpu: 1.33, memory: 0.97 },
//     { pid: 17208, name: "node.exe", cpu: 1.33, memory: 0.4 },
//     { pid: 11764, name: "WmiPrvSE.exe", cpu: 1.11, memory: 0.18 },
//     { pid: 18236, name: "msedge.exe", cpu: 1.11, memory: 0.88 },
//     { pid: 15320, name: "WmiPrvSE.exe", cpu: 1.11, memory: 0.36 },
//   ],
// };
