import type { IconName } from '../components/Icon';
import type { TabId } from '../types';

export const TABS: { id: TabId; label: string; title: string; icon: IconName }[] = [
  { id: 'supervision', label: "Vue d'ensemble", title: 'Vue d’ensemble', icon: 'grid' },
  { id: 'capteurs', label: 'Capteurs', title: 'Capteurs', icon: 'pulse' },
  { id: 'vision', label: 'Vision IA', title: 'Vision IA', icon: 'video' },
  { id: 'alertes', label: 'Alertes', title: 'Alertes', icon: 'bell' },
  { id: 'commandes', label: 'Commandes', title: 'Commandes', icon: 'power' },
  { id: 'regles', label: 'Règles', title: 'Règles et seuils', icon: 'sliders' },
  { id: 'systeme', label: 'Système', title: 'Système', icon: 'shield' },
];
