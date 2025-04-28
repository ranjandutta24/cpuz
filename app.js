const http = require("http");
const si = require("systeminformation");

const PORT = 3000;

http
  .createServer(async (req, res) => {
    if (req.url === "/stats") {
      // Setup SSE headers
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "Access-Control-Allow-Origin": "*", // Allow all origins
      });

      // Push data every second
      const interval = setInterval(async () => {
        const cpu = await si.currentLoad();
        const mem = await si.mem();
        const disk = await si.fsSize();

        const data = {
          cpuUsage: cpu.currentLoad.toFixed(2),
          ramUsage: ((mem.active / mem.total) * 100).toFixed(2),
          totalRam: (mem.total / 1073741824).toFixed(2),
          diskUsage: ((disk[0].used / disk[0].size) * 100).toFixed(2),
        };

        // Send JSON as SSE event
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      }, 1000);

      // Handle client disconnect
      req.on("close", () => {
        clearInterval(interval);
        res.end();
      });
    } else {
      res.writeHead(404);
      res.end("Not Found");
    }
  })
  .listen(PORT, () =>
    console.log(`✅ SSE server running on http://localhost:${PORT}/stats`)
  );
