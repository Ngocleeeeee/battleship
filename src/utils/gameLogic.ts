import { GRID_SIZE, SHIPS, ShipInstance, ShipType, Coordinate, Shot } from '../types';

// Helper to check if a coordinate is within grid bounds
export function isValidCoordinate(r: number, c: number): boolean {
  return r >= 0 && r < GRID_SIZE && c >= 0 && c < GRID_SIZE;
}

// Get the coordinates occupied by a ship instance
export function getShipCoordinates(r: number, c: number, size: number, vertical: boolean): Coordinate[] {
  const coords: Coordinate[] = [];
  for (let i = 0; i < size; i++) {
    const currR = vertical ? r + i : r;
    const currC = vertical ? c : c + i;
    coords.push({ r: currR, c: currC });
  }
  return coords;
}

// Verifies if a ship can be placed at the given location
export function canPlaceShip(
  r: number,
  c: number,
  size: number,
  vertical: boolean,
  currentShips: ShipInstance[],
  excludeType?: ShipType
): boolean {
  const shipCoords = getShipCoordinates(r, c, size, vertical);

  // Check bounds
  for (const coord of shipCoords) {
    if (!isValidCoordinate(coord.r, coord.c)) {
      return false;
    }
  }

  // Check overlap with other ships
  for (const ship of currentShips) {
    if (excludeType && ship.type === excludeType) continue;

    const otherCoords = getShipCoordinates(ship.r, ship.c, getShipSize(ship.type), ship.vertical);
    for (const sc of shipCoords) {
      for (const oc of otherCoords) {
        if (sc.r === oc.r && sc.c === oc.c) {
          return false; // Collision detected
        }
      }
    }
  }

  return true;
}

// Helper to get size of a ship type
export function getShipSize(type: ShipType): number {
  const def = SHIPS.find((s) => s.type === type);
  return def ? def.size : 0;
}

// Generate random valid placements for all ships
export function generateRandomBoard(): ShipInstance[] {
  const ships: ShipInstance[] = [];

  for (const shipDef of SHIPS) {
    let placed = false;
    let attempts = 0;

    while (!placed && attempts < 200) {
      const vertical = Math.random() < 0.5;
      const r = Math.floor(Math.random() * GRID_SIZE);
      const c = Math.floor(Math.random() * GRID_SIZE);

      if (canPlaceShip(r, c, shipDef.size, vertical, ships)) {
        ships.push({
          type: shipDef.type,
          r,
          c,
          vertical,
          hits: new Array(shipDef.size).fill(false),
          sunk: false,
        });
        placed = true;
      }
      attempts++;
    }
  }

  return ships;
}

// Get the ship residing in a specific coordinate
export function getShipAtCoordinate(r: number, c: number, ships: ShipInstance[]): { ship: ShipInstance; index: number; segmentIndex: number } | null {
  for (let sIdx = 0; sIdx < ships.length; sIdx++) {
    const ship = ships[sIdx];
    const coords = getShipCoordinates(ship.r, ship.c, getShipSize(ship.type), ship.vertical);
    
    for (let segIdx = 0; segIdx < coords.length; segIdx++) {
      if (coords[segIdx].r === r && coords[segIdx].c === c) {
        return { ship, index: sIdx, segmentIndex: segIdx };
      }
    }
  }
  return null;
}

// Helper to check if a specific ship is sunk under a set of shots
export function isShipSunk(ship: ShipInstance, shots: Shot[]): boolean {
  const coords = getShipCoordinates(ship.r, ship.c, getShipSize(ship.type), ship.vertical);
  return coords.every((coord) => 
    shots.some((s) => s.r === coord.r && s.c === coord.c && s.hit)
  );
}

// Deep AI Shooting Strategy
export function getNextAIShot(playerShips: ShipInstance[], shots: Shot[]): Coordinate {
  // Find all coordinates shot that was a hit, but the ship that is residing there is NOT sunk yet
  const hitUnSunkShots: Shot[] = [];
  
  for (const shot of shots) {
    if (shot.hit) {
      // Find ship at this shot coordinate
      const hitShipInfo = getShipAtCoordinate(shot.r, shot.c, playerShips);
      if (hitShipInfo) {
        // Is this ship sunk? Check it based on shots
        const sunk = isShipSunk(hitShipInfo.ship, shots);
        if (!sunk) {
          hitUnSunkShots.push(shot);
        }
      }
    }
  }

  const shotSet = new Set(shots.map((s) => `${s.r},${s.c}`));

  // TARGET MODE: If there are recorded hits on ships that are not yet sunk
  if (hitUnSunkShots.length > 0) {
    // 1. If we have 2 or more hits on the same unsunk ship, we can find the direction line
    if (hitUnSunkShots.length >= 2) {
      // Group them by ship type to be completely accurate, or look at alignment
      // Let's identify which ship the hits belong to and do strategic linear hunting
      for (const playerShip of playerShips) {
        const shipHitsOnBoard = hitUnSunkShots.filter(s => {
          const info = getShipAtCoordinate(s.r, s.c, [playerShip]);
          return info !== null;
        });

        if (shipHitsOnBoard.length >= 2) {
          // Check if align horizontal or vertical
          const isVertical = shipHitsOnBoard.every((s, _, arr) => s.c === arr[0].c);
          const isHorizontal = shipHitsOnBoard.every((s, _, arr) => s.r === arr[0].r);

          if (isVertical) {
            const col = shipHitsOnBoard[0].c;
            const rows = shipHitsOnBoard.map(s => s.r).sort((a, b) => a - b);
            
            // Try firing just outside the min and max row found
            const potentialTargets = [
              { r: rows[0] - 1, c: col },
              { r: rows[rows.length - 1] + 1, c: col }
            ];

            for (const t of potentialTargets) {
              if (isValidCoordinate(t.r, t.c) && !shotSet.has(`${t.r},${t.c}`)) {
                return t;
              }
            }
          } else if (isHorizontal) {
            const row = shipHitsOnBoard[0].r;
            const cols = shipHitsOnBoard.map(s => s.c).sort((a, b) => a - b);

            const potentialTargets = [
              { r: row, c: cols[0] - 1 },
              { r: row, c: cols[cols.length - 1] + 1 }
            ];

            for (const t of potentialTargets) {
              if (isValidCoordinate(t.r, t.c) && !shotSet.has(`${t.r},${t.c}`)) {
                return t;
              }
            }
          }
        }
      }
    }

    // 2. Single hit or fell through linear targets (orthogonal exploration around active hits)
    for (const activeHit of hitUnSunkShots) {
      const neighbors = [
        { r: activeHit.r - 1, c: activeHit.c }, // Up
        { r: activeHit.r + 1, c: activeHit.c }, // Down
        { r: activeHit.r, c: activeHit.c - 1 }, // Left
        { r: activeHit.r, c: activeHit.c + 1 }, // Right
      ];

      // Shuffle neighbors slightly to make it feel human and natural
      const shuffledNeighbors = neighbors.sort(() => Math.random() - 0.5);

      for (const n of shuffledNeighbors) {
        if (isValidCoordinate(n.r, n.c) && !shotSet.has(`${n.r},${n.c}`)) {
          return n;
        }
      }
    }
  }

  // HUNT MODE: If no current unsunk hit on board.
  // 1. Let's do a smart checkerboard (parity) hunt to optimize speed
  // Only cells where (r + c) % 2 === 0
  const checkerboardTargets: Coordinate[] = [];
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      if ((r + c) % 2 === 0 && !shotSet.has(`${r},${c}`)) {
        checkerboardTargets.push({ r, c });
      }
    }
  }

  if (checkerboardTargets.length > 0) {
    const randomIndex = Math.floor(Math.random() * checkerboardTargets.length);
    return checkerboardTargets[randomIndex];
  }

  // 2. Fallback: Any valid index on grid
  const allTargets: Coordinate[] = [];
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      if (!shotSet.has(`${r},${c}`)) {
        allTargets.push({ r, c });
      }
    }
  }

  const randomIndex = Math.floor(Math.random() * allTargets.length);
  return allTargets[randomIndex];
}
