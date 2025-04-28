const si = require("systeminformation");

async function getSystemInfo() {
  try {
    const os = await si.osInfo();
    const cpu = await si.cpu();

    const cpuLoad = await si.currentLoad();
    const mem = await si.mem();
    // const disk = await si.fsSize();
    // const battery = await si.battery();
    // const net = await si.networkInterfaces();
    // const netStats = await si.networkStats();
    const gpu = await si.graphics();
    const sys = await si.system();
    const bios = await si.bios();
    const baseboard = await si.baseboard();
    // const time = await si.time();
    // const processes = await si.processes();

    console.log("\n--- SYSTEM INFO ---");
    console.log(`OS: ${os.distro} ${os.release}`);
    console.log(`Hostname: ${os.hostname}`);
    console.log(`Arch: ${os.arch}`);

    console.log("\n--- CPU INFO ---");
    console.log(`CPU: ${cpu.manufacturer} ${cpu.brand}`);
    console.log(`Cores: ${cpu.cores}, Physical Cores: ${cpu.physicalCores}`);
    console.log(`Speed: ${cpu.speed} GHz`);
    console.log(`CPU Usage: ${cpuLoad.currentLoad.toFixed(2)} %`);

    console.log("\n--- MEMORY ---");
    console.log(`Total: ${(mem.total / 1073741824).toFixed(2)} GB`);
    console.log(`Used: ${(mem.active / 1073741824).toFixed(2)} GB`);
    console.log(`Free: ${(mem.free / 1073741824).toFixed(2)} GB`);

    // console.log("\n--- DISK ---");
    // disk.forEach((d, i) => {
    //   console.log(
    //     `Disk ${i}: ${d.fs} | Size: ${(d.size / 1073741824).toFixed(
    //       2
    //     )} GB | Used: ${(d.used / 1073741824).toFixed(2)} GB`
    //   );
    // });

    // console.log("\n--- BATTERY ---");
    // console.log(`Is Charging: ${battery.isCharging}`);
    // console.log(`Percent: ${battery.percent} %`);
    // console.log(`Cycles: ${battery.cyclecount}`);

    // console.log("\n--- NETWORK ---");
    // net.forEach((n, i) => {
    //   console.log(`Interface ${i}: ${n.iface} | IP: ${n.ip4}`);
    // });
    // console.log(
    //   `Network Rx: ${(netStats[0].rx_bytes / 1048576).toFixed(2)} MB`
    // );
    // console.log(
    //   `Network Tx: ${(netStats[0].tx_bytes / 1048576).toFixed(2)} MB`
    // );

    console.log("\n--- GPU ---");
    gpu.controllers.forEach((g, i) => {
      console.log(`GPU ${i}: ${g.model} | VRAM: ${g.vram} MB`);
    });

    console.log("\n--- SYSTEM / BIOS ---");
    console.log(`Manufacturer: ${sys.manufacturer}`);
    console.log(`Model: ${sys.model}`);
    console.log(`BIOS Version: ${bios.version}`);
    console.log(`Motherboard: ${baseboard.manufacturer} ${baseboard.model}`);

    // console.log("\n--- TIME ---");
    // console.log(`Uptime: ${(time.uptime / 3600).toFixed(2)} hours`);
    // console.log(
    //   `Boot Time: ${new Date(time.bootTime * 1000).toLocaleString()}`
    // );

    // console.log("\n--- PROCESSES ---");
    // console.log(`Total Processes: ${processes.all}`);
    // console.log(`Running: ${processes.running}`);
    // console.log(`Blocked: ${processes.blocked}`);
  } catch (error) {
    console.error("Error retrieving system info:", error);
  }
}

getSystemInfo();
