import { Routes } from '@angular/router';
import { MachineList } from './pages/machine-list/machine-list';
import { MachineDetail } from './pages/machine-detail/machine-detail';

export const routes: Routes = [
  { path: '', component: MachineList },
  { path: 'machine/:ip', component: MachineDetail },
  { path: '**', redirectTo: '' },
];
