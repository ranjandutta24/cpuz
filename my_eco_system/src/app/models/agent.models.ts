// Typed interfaces describing the data returned by the Node monitoring agent
// running on each machine (see logger.js on the Node side).

/** A machine on the network that (may be) running the Node agent. */
export interface Machine {
  /** IPv4 address, e.g. "192.168.1.42" */
  ip: string;
  /** Port the Node agent listens on (default 3000). */
  port: number;
  /** Optional friendly name the user gives the machine. */
  label?: string;
  /** Last known reachability status. */
  status: 'unknown' | 'online' | 'offline' | 'checking';
  /** Basic system info, populated after a successful /info call. */
  info?: SystemInfo;
  /** Timestamp (ms) of the last successful health check. */
  lastSeen?: number;
}

/** Shape of the GET /info response from the agent. */
export interface SystemInfo {
  cpu: {
    manufacturer: string;
    brand: string;
    cores: number;
    speed: string;
  };
  gpu: {
    model?: string;
    vendor?: string;
    vramMB?: number;
  };
  ram: {
    total: string;
  };
  disk: {
    size: string;
    used: string;
  };
  os: {
    platform: string;
    distro: string;
    release: string;
  };
  /** Full OS/version details when available (from /check_info). */
  osDetails?: {
    distro: string;
    release: string;
    build: string;
    servicepack: string;
    kernel: string;
    arch: string;
    codename: string;
  } | null;
  /** Aggregated storage + per-disk breakdown (from /check_info). */
  storage?: StorageSummary | null;
}

/** A single process/running app entry from the monitor stream. */
export interface ProcessInfo {
  pid: number;
  name: string;
  cpu: number;
  memory: number;
  memoryMB?: number;
  user?: string;
}

/** A network interface's live throughput. */
export interface NetworkStat {
  interface: string;
  rxBytes: number;
  txBytes: number;
  rxRate: number;
  txRate: number;
}

/** A GPU controller entry. */
export interface GpuStat {
  model: string;
  vendor: string;
  vramMB: number;
}

/** A service entry. */
export interface ServiceStat {
  name: string;
  running: boolean;
}

/** Shape of each SSE message from GET /monitor/live. */
export interface MonitorSnapshot {
  timestamp: number;
  cpu: {
    usage: number;
    temperature: number | null;
  };
  memory: {
    totalGB: number;
    usedPercent: number;
  };
  network: NetworkStat[];
  diskIO: {
    readBytesPerSec: number;
    writeBytesPerSec: number;
  };
  gpu: GpuStat[];
  services: ServiceStat[];
  processCount?: {
    all: number;
    running: number;
  };
  processes: ProcessInfo[];
}

/** Shape of the fast GET /check_info response (one-shot, no SSE). */
export interface CheckInfo {
  ok: boolean;
  hostname: string;
  platform: string;
  release: string;
  arch: string;
  uptime: number;
  cpu: {
    model: string;
    cores: number;
    speedMHz: number;
  };
  ram: {
    totalGB: number;
    usedGB: number;
    usedPercent: number;
  };
  osDetails?: {
    distro: string;
    release: string;
    build: string;
    servicepack: string;
    kernel: string;
    arch: string;
    codename: string;
  } | null;
  storage?: StorageSummary | null;
  loadavg: number[];
  timestamp: number;
}

/** A single disk/partition entry from /check_info storage. */
export interface DiskInfo {
  fs: string;
  type: string;
  mount: string;
  sizeGB: number;
  usedGB: number;
  availableGB: number;
  usedPercent: number;
}

/** Aggregated storage summary + per-disk breakdown. */
export interface StorageSummary {
  totalGB: number;
  usedGB: number;
  availableGB: number;
  usedPercent: number;
  disks: DiskInfo[];
}
