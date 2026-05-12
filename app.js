const express = require("express");
const si = require("systeminformation");
const dotenv = require("dotenv");
const app = express();
const PORT = 3000;

app.use(express.json());

// Allow CORS for all origins
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  next();
});

dotenv.config({ path: "./config.env" });

// require("./startup/db")();
app.use(require("./logger"));
const port = process.env.PORT || 3000;

// Import the stats route - this will automatically start monitoring
// const statsRoute = require("./routes/status");

// Routes
// app.use("/stats", statsRoute);
// app.use("/info", require("./routes/info"));

const server = app.listen(port, () => {
  console.log(`Listening on port ${port}...`);

  // Get the actual port (in case it was different from what we specified)
  const actualPort = server.address().port;

  console.log(`✅ Express server running at http://localhost:${actualPort}`);
  console.log(`📊 Stats route:   http://localhost:${actualPort}/stats`);
  console.log(`ℹ️  Info route:    http://localhost:${actualPort}/info`);
  console.log(`🤖 Auto-monitoring: ENABLED (every 5 seconds)`);
  console.log(`\n🚀 Server started successfully!`);
  console.log(`⏰ ${new Date().toLocaleString()}`);
});

// Clean shutdown
process.on("SIGINT", () => {
  console.log("\n🛑 Shutting down server gracefully...");
  server.close(() => {
    console.log("✅ Server closed");
    process.exit(0);
  });
});

module.exports = app;
//
