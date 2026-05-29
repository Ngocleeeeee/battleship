export type ShipType = 'carrier' | 'battleship' | 'destroyer' | 'submarine' | 'patrol';

export interface ShipDefinition {
  type: ShipType;
  name: string;
  size: number;
  color: string;
  icon: string;
}

export interface ShipInstance {
  type: ShipType;
  r: number; // starting row (0-9)
  c: number; // starting column (0-9)
  vertical: boolean;
  hits: boolean[]; // Array of size representing hit status for each segment
  sunk: boolean;
}

export interface Coordinate {
  r: number;
  c: number;
}

export interface Shot {
  r: number;
  c: number;
  hit: boolean;
  shipType?: ShipType;
}

export type GamePhase = 'setup' | 'playing' | 'victory' | 'defeat';

export interface GameLog {
  id: string;
  timestamp: string;
  message: string;
  type: 'info' | 'player-hit' | 'player-miss' | 'enemy-hit' | 'enemy-miss' | 'sunk';
}

export const SHIPS: ShipDefinition[] = [
  { type: 'carrier', name: 'Tàu Sân Bay', size: 5, color: '#10b981', icon: 'Ship' }, // emerald-500
  { type: 'battleship', name: 'Tàu Chiến Hạm', size: 4, color: '#3b82f6', icon: 'FlameKindling' }, // blue-500
  { type: 'destroyer', name: 'Tàu Khu Trục', size: 3, color: '#f59e0b', icon: 'Compass' }, // amber-500
  { type: 'submarine', name: 'Tàu Ngầm', size: 3, color: '#8b5cf6', icon: 'Waves' }, // violet-500
  { type: 'patrol', name: 'Tàu Tuần Tra', size: 2, color: '#ec4899', icon: 'Anchor' }, // pink-500
];

export const GRID_SIZE = 10;
