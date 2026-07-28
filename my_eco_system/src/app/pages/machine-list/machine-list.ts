import {
  Component,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AgentService } from '../../services/agent.service';

/** How often (ms) to auto-check each saved machine's /info endpoint. */
const POLL_INTERVAL = 5000;

@Component({
  selector: 'app-machine-list',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './machine-list.html',
  styleUrl: './machine-list.scss',
})
export class MachineList implements OnInit, OnDestroy {
  private agent = inject(AgentService);
  private router = inject(Router);

  readonly machines = this.agent.machines;

  // Add-machine form state
  newIp = signal('');
  newLabel = signal('');
  addError = signal('');

  // Scan form state
  scanBase = signal(this.agent.guessSubnetBase());
  scanFrom = signal(1);
  scanTo = signal(254);
  scanning = signal(false);
  scanDone = signal(0);
  scanTotal = signal(0);
  scanFound = signal<string[]>([]);

  // Auto-poll state
  autoRefresh = signal(true);
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private polling = false;

  readonly onlineCount = computed(
    () => this.machines().filter((m) => m.status === 'online').length,
  );

  ngOnInit(): void {
    // Kick off an immediate check, then poll on an interval.
    this.pollNow();
    this.startPolling();
  }

  ngOnDestroy(): void {
    this.stopPolling();
  }

  // ---------- auto refresh ----------

  private startPolling(): void {
    if (this.pollTimer) return;
    this.pollTimer = setInterval(() => this.pollNow(), POLL_INTERVAL);
  }

  private stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  /** Silently re-check every machine; skips if a cycle is still in flight. */
  private async pollNow(): Promise<void> {
    if (this.polling || !this.machines().length) return;
    this.polling = true;
    try {
      await this.agent.checkAll(true);
    } finally {
      this.polling = false;
    }
  }

  toggleAutoRefresh(): void {
    this.autoRefresh.update((on) => !on);
    if (this.autoRefresh()) {
      this.pollNow();
      this.startPolling();
    } else {
      this.stopPolling();
    }
  }

  add(): void {
    this.addError.set('');
    const ip = this.newIp().trim();
    if (!this.agent.isValidIp(ip)) {
      this.addError.set('Please enter a valid IPv4 address.');
      return;
    }
    const label = this.newLabel().trim() || undefined;
    const created = this.agent.addMachine(ip, 3000, label);
    if (!created) {
      this.addError.set('That machine is already in the list.');
      return;
    }
    this.newIp.set('');
    this.newLabel.set('');
  }

  remove(ip: string, event: Event): void {
    event.stopPropagation();
    this.agent.removeMachine(ip);
  }

  refresh(ip: string, event: Event): void {
    event.stopPropagation();
    const m = this.agent.getMachine(ip);
    if (m) this.agent.checkHealth(m);
  }

  refreshAll(): void {
    this.agent.checkAll();
  }

  open(ip: string): void {
    this.router.navigate(['/machine', ip]);
  }

  async scan(): Promise<void> {
    if (this.scanning()) return;
    this.scanning.set(true);
    this.scanFound.set([]);
    this.scanDone.set(0);
    this.scanTotal.set(0);
    try {
      await this.agent.scanSubnet(
        this.scanBase(),
        Number(this.scanFrom()),
        Number(this.scanTo()),
        3000,
        (done, total, found) => {
          this.scanDone.set(done);
          this.scanTotal.set(total);
          this.scanFound.set(found);
        },
      );
    } finally {
      this.scanning.set(false);
    }
  }

  scanProgress = computed(() => {
    const total = this.scanTotal();
    if (!total) return 0;
    return Math.round((this.scanDone() / total) * 100);
  });
}
