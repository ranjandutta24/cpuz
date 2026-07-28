import {
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { AgentService } from '../../services/agent.service';
import {
  Machine,
  MonitorSnapshot,
  ProcessInfo,
} from '../../models/agent.models';

const HISTORY_LEN = 60; // number of samples kept for the graphs

type SortKey = 'pid' | 'name' | 'cpu' | 'memory' | 'memoryMB' | 'user';
type SortDir = 'asc' | 'desc';

@Component({
  selector: 'app-machine-detail',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './machine-detail.html',
  styleUrl: './machine-detail.scss',
  host: {
    '[class.process-view]': "view() === 'processes'",
  },
})
export class MachineDetail {
  private agent = inject(AgentService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private destroyRef = inject(DestroyRef);

  ip = signal('');
  machine = signal<Machine | undefined>(undefined);

  snapshot = signal<MonitorSnapshot | null>(null);
  cpuHistory = signal<number[]>([]);
  memHistory = signal<number[]>([]);
  connection = signal<'connecting' | 'live' | 'error'>('connecting');

  // Which panel the main column shows.
  view = signal<'graphs' | 'processes'>('graphs');

  // Process table controls
  sortKey = signal<SortKey>('cpu');
  sortDir = signal<SortDir>('desc');
  filter = signal('');

  // Derived convenience values
  cpu = computed(() => this.snapshot()?.cpu.usage ?? 0);
  mem = computed(() => this.snapshot()?.memory.usedPercent ?? 0);
  memTotal = computed(() => this.snapshot()?.memory.totalGB ?? 0);
  processes = computed(() => this.snapshot()?.processes ?? []);
  network = computed(() => this.snapshot()?.network ?? []);
  gpu = computed(() => this.snapshot()?.gpu ?? []);
  cpuTemp = computed(() => this.snapshot()?.cpu.temperature ?? null);
  processCount = computed(() => this.snapshot()?.processCount ?? null);
  info = computed(() => this.machine()?.info);

  // Filtered + sorted process list for the table.
  visibleProcesses = computed<ProcessInfo[]>(() => {
    const term = this.filter().trim().toLowerCase();
    let list = this.processes();
    if (term) {
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(term) ||
          String(p.pid).includes(term) ||
          (p.user ?? '').toLowerCase().includes(term),
      );
    }
    const key = this.sortKey();
    const dir = this.sortDir() === 'asc' ? 1 : -1;
    return [...list].sort((a, b) => {
      const av = a[key] ?? 0;
      const bv = b[key] ?? 0;
      if (typeof av === 'string' || typeof bv === 'string') {
        return String(av).localeCompare(String(bv)) * dir;
      }
      return ((av as number) - (bv as number)) * dir;
    });
  });

  // SVG polyline points for the CPU/mem graphs (viewBox 0 0 100 100).
  cpuPoints = computed(() => this.toPoints(this.cpuHistory()));
  memPoints = computed(() => this.toPoints(this.memHistory()));
  cpuArea = computed(() => this.toArea(this.cpuHistory()));

  constructor() {
    this.route.paramMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((params) => {
        const ip = params.get('ip') ?? '';
        this.ip.set(ip);
        this.machine.set(this.agent.getMachine(ip));
        this.connect(ip);
      });
  }

  private connect(ip: string): void {
    const m = this.agent.getMachine(ip) ?? { ip, port: 3000 };
    // Refresh static info in the background.
    if (this.agent.getMachine(ip)) {
      this.agent.checkHealth(this.agent.getMachine(ip)!).then(() => {
        this.machine.set(this.agent.getMachine(ip));
      });
    }

    this.connection.set('connecting');
    this.agent
      .monitorStream(m)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (snap) => {
          this.connection.set('live');
          this.snapshot.set(snap);
          this.cpuHistory.update((h) =>
            [...h, snap.cpu.usage].slice(-HISTORY_LEN),
          );
          this.memHistory.update((h) =>
            [...h, snap.memory.usedPercent].slice(-HISTORY_LEN),
          );
        },
        error: () => this.connection.set('error'),
      });
  }

  back(): void {
    this.router.navigate(['/']);
  }

  reconnect(): void {
    this.connect(this.ip());
  }

  /** Toggle the main column between the live graphs and the process table. */
  toggleView(): void {
    this.view.update((v) => (v === 'graphs' ? 'processes' : 'graphs'));
  }

  // ---------- process table sorting ----------

  /** Click a column header: toggle direction if same key, else switch key. */
  setSort(key: SortKey): void {
    if (this.sortKey() === key) {
      this.sortDir.update((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      this.sortKey.set(key);
      // Text columns default to ascending, numbers to descending.
      this.sortDir.set(key === 'name' || key === 'user' ? 'asc' : 'desc');
    }
  }

  sortIndicator(key: SortKey): string {
    if (this.sortKey() !== key) return '';
    return this.sortDir() === 'asc' ? ' ▲' : ' ▼';
  }

  // ---------- graph helpers ----------

  /** Map a 0..100 value series to an SVG polyline "x,y x,y ..." string. */
  private toPoints(series: number[]): string {
    if (series.length < 2) {
      const y = 100 - (series[0] ?? 0);
      return `0,${y} 100,${y}`;
    }
    const step = 100 / (series.length - 1);
    return series
      .map((v, i) => `${(i * step).toFixed(2)},${(100 - v).toFixed(2)}`)
      .join(' ');
  }

  /** Same as toPoints but closed into a filled area path. */
  private toArea(series: number[]): string {
    if (!series.length) return '';
    const pts = this.toPoints(series);
    return `0,100 ${pts} 100,100`;
  }

  formatRate(bytesPerSec: number): string {
    if (bytesPerSec < 1024) return `${bytesPerSec.toFixed(0)} B/s`;
    if (bytesPerSec < 1024 * 1024)
      return `${(bytesPerSec / 1024).toFixed(1)} KB/s`;
    return `${(bytesPerSec / 1024 / 1024).toFixed(2)} MB/s`;
  }
}
