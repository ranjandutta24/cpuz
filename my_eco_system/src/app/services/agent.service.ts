import { Injectable, NgZone, signal } from '@angular/core';
import { Observable } from 'rxjs';
import {
  CheckInfo,
  Machine,
  MonitorSnapshot,
  ProcessSnapshot,
  SystemInfo,
} from '../models/agent.models';

const STORAGE_KEY = 'eco_machines_v1';
const DEFAULT_PORT = 3000;

/**
 * Central service for discovering and talking to the Node monitoring agents
 * that run on each machine on the local network.
 *
 * Responsibilities:
 *  - keep a persisted list of known machines (localStorage)
 *  - health-check a machine via GET /info
 *  - scan a subnet range to auto-discover agents
 *  - open a live SSE stream to /monitor/live for a selected machine
 */
@Injectable({ providedIn: 'root' })
export class AgentService {
  /** Reactive list of known machines, kept in sync with localStorage. */
  readonly machines = signal<Machine[]>([]);

  constructor(private zone: NgZone) {
    this.machines.set(this.load());
  }

  // ---------- persistence ----------

  private load(): Machine[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as Machine[];
      // Reset volatile status on load.
      return parsed.map((m) => ({ ...m, status: 'unknown', info: undefined }));
    } catch {
      return [];
    }
  }

  private persist(): void {
    const slim = this.machines().map((m) => ({
      ip: m.ip,
      port: m.port,
      label: m.label,
      status: 'unknown' as const,
    }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(slim));
  }

  // ---------- list management ----------

  baseUrl(m: Pick<Machine, 'ip' | 'port'>): string {
    return `http://${m.ip}:${m.port}`;
  }

  getMachine(ip: string): Machine | undefined {
    return this.machines().find((m) => m.ip === ip);
  }

  addMachine(ip: string, port = DEFAULT_PORT, label?: string): Machine | null {
    ip = ip.trim();
    if (!this.isValidIp(ip)) return null;
    if (this.machines().some((m) => m.ip === ip)) {
      return this.getMachine(ip) ?? null;
    }
    const machine: Machine = { ip, port, label, status: 'unknown' };
    this.machines.update((list) => [...list, machine]);
    this.persist();
    // Fire a health check but don't block the caller.
    this.checkHealth(machine).catch(() => {});
    return machine;
  }

  removeMachine(ip: string): void {
    this.machines.update((list) => list.filter((m) => m.ip !== ip));
    this.persist();
  }

  updateMachine(ip: string, patch: Partial<Machine>): void {
    this.machines.update((list) => list.map((m) => (m.ip === ip ? { ...m, ...patch } : m)));
    // Only persist the durable fields.
    if ('label' in patch || 'port' in patch) this.persist();
  }

  // ---------- health checks ----------

  /**
   * Ping GET /info for a machine and update its status + info.
   * @param silent when true, skip the intermediate "checking" state — used by
   *   the background poller so the status dot doesn't flicker every cycle.
   */
  async checkHealth(machine: Machine, timeoutMs = 3000, silent = false): Promise<boolean> {
    if (!silent) this.updateMachine(machine.ip, { status: 'checking' });
    const check = await this.probeCheckInfo(machine.ip, machine.port, timeoutMs);
    if (check) {
      this.updateMachine(machine.ip, {
        status: 'online',
        info: this.toSystemInfo(check),
        lastSeen: Date.now(),
      });
      return true;
    }
    this.updateMachine(machine.ip, { status: 'offline' });
    return false;
  }

  /** Refresh the status of every known machine in parallel. */
  async checkAll(silent = false): Promise<void> {
    await Promise.all(this.machines().map((m) => this.checkHealth(m, 3000, silent)));
  }

  /**
   * Low-level: fast one-shot probe of GET /check_info. Returns parsed CheckInfo
   * or null on failure/timeout. This is the endpoint used for online/offline
   * detection and subnet scanning — it is quick because the Node agent builds
   * it from the built-in `os` module rather than slow hardware probing.
   */
  private async probeCheckInfo(
    ip: string,
    port: number,
    timeoutMs = 2000,
  ): Promise<CheckInfo | null> {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`http://${ip}:${port}/check_info`, {
        signal: controller.signal,
      });
      if (!res.ok) return null;
      const data = (await res.json()) as CheckInfo;
      return data && data.ok ? data : null;
    } catch {
      return null;
    } finally {
      clearTimeout(t);
    }
  }

  /** Map the fast /check_info payload into the SystemInfo shape used by cards. */
  private toSystemInfo(c: CheckInfo): SystemInfo {
    return {
      cpu: {
        manufacturer: '',
        brand: c.cpu.model,
        cores: c.cpu.cores,
        speed: (c.cpu.speedMHz / 1000).toFixed(2) + ' GHz',
      },
      gpu: {},
      ram: { total: c.ram.totalGB.toFixed(2) + ' GB' },
      disk: c.storage
        ? {
            size: c.storage.totalGB.toFixed(2) + ' GB',
            used: c.storage.usedGB.toFixed(2) + ' GB',
          }
        : { size: '', used: '' },
      os: {
        platform: c.platform,
        distro: c.hostname,
        release: c.release,
      },
      osDetails: c.osDetails ?? null,
      storage: c.storage ?? null,
    };
  }

  // ---------- subnet discovery ----------

  /**
   * Scan a subnet for agents by probing /info on each host.
   * @param base   first three octets, e.g. "192.168.1"
   * @param from   starting last octet (inclusive)
   * @param to     ending last octet (inclusive)
   * @param port   agent port
   * @param onProgress optional callback (done, total)
   * @param addFound   if true, discovered machines are added to the list
   * @returns array of IPs that responded
   */
  async scanSubnet(
    base: string,
    from: number,
    to: number,
    port = DEFAULT_PORT,
    onProgress?: (done: number, total: number, found: string[]) => void,
    addFound = true,
  ): Promise<string[]> {
    base = base.trim().replace(/\.$/, '');
    const found: string[] = [];
    const total = to - from + 1;
    let done = 0;

    // Probe in batches to avoid opening hundreds of sockets at once.
    const batchSize = 32;
    const octets: number[] = [];
    for (let i = from; i <= to; i++) octets.push(i);

    for (let i = 0; i < octets.length; i += batchSize) {
      const batch = octets.slice(i, i + batchSize);
      await Promise.all(
        batch.map(async (octet) => {
          const ip = `${base}.${octet}`;
          const check = await this.probeCheckInfo(ip, port, 1000);
          done++;
          if (check) {
            found.push(ip);
            if (addFound) {
              const info = this.toSystemInfo(check);
              const existing = this.getMachine(ip);
              if (existing) {
                this.updateMachine(ip, {
                  status: 'online',
                  info,
                  lastSeen: Date.now(),
                });
              } else {
                this.machines.update((list) => [
                  ...list,
                  { ip, port, status: 'online', info, lastSeen: Date.now() },
                ]);
                this.persist();
              }
            }
          }
          onProgress?.(done, total, [...found]);
        }),
      );
    }
    return found;
  }

  // ---------- live monitor stream ----------

  /**
   * Open an SSE connection to /monitor/live for the given machine and emit a
   * MonitorSnapshot for each message. Unsubscribe to close the connection.
   */
  monitorStream(machine: Pick<Machine, 'ip' | 'port'>): Observable<MonitorSnapshot> {
    return this.sseStream<MonitorSnapshot>(
      `${this.baseUrl(machine)}/monitor/live`,
    );
  }

  /**
   * Open an SSE connection to /monitor/live_process (the full process list).
   * Kept separate from monitorStream so it's only opened when the Live process
   * tab is active. Unsubscribe to close the connection.
   */
  processStream(machine: Pick<Machine, 'ip' | 'port'>): Observable<ProcessSnapshot> {
    return this.sseStream<ProcessSnapshot>(
      `${this.baseUrl(machine)}/monitor/live_process`,
    );
  }

  /** Generic SSE-to-Observable bridge that re-enters Angular's zone. */
  private sseStream<T>(url: string): Observable<T> {
    return new Observable<T>((subscriber) => {
      const source = new EventSource(url);

      source.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as T;
          // EventSource callbacks run outside Angular's zone; re-enter so the
          // UI updates. (Signals still work, but this keeps CD predictable.)
          this.zone.run(() => subscriber.next(data));
        } catch {
          /* ignore malformed frames */
        }
      };

      source.onerror = () => {
        // The browser auto-reconnects; surface the error so the UI can show a
        // "reconnecting" state without tearing the stream down.
        this.zone.run(() => subscriber.error(new Error('stream error')));
      };

      return () => source.close();
    });
  }

  // ---------- helpers ----------

  isValidIp(ip: string): boolean {
    const m = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (!m) return false;
    return m.slice(1).every((o) => {
      const n = Number(o);
      return n >= 0 && n <= 255;
    });
  }

  /** Best-effort guess of the local /24 base from the current host. */
  guessSubnetBase(): string {
    const host = location.hostname;
    if (this.isValidIp(host)) {
      const parts = host.split('.');
      parts[3] = '';
      return parts.slice(0, 3).join('.');
    }
    return '10.143.17';
  }
}
