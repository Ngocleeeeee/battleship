import React from 'react';
import { Target, Flame, Anchor, ShieldAlert } from 'lucide-react';
import { GRID_SIZE, ShipInstance, Shot, Coordinate, GamePhase, ShipType, SHIPS } from '../types';
import { getShipAtCoordinate, getShipCoordinates, getShipSize } from '../utils/gameLogic';

interface BoardGridProps {
  owner: 'player' | 'computer';
  ships: ShipInstance[];
  shots: Shot[];
  phase: GamePhase;
  activeShipType: ShipType | null;
  activeVertical: boolean;
  hoverCoordinate: Coordinate | null;
  onCellClick: (r: number, c: number) => void;
  onCellMouseEnter?: (r: number, c: number) => void;
  onCellMouseLeave?: () => void;
  showUnSunkShips: boolean; // True for player board, or when cheat/reveal is on for computer board
  retro?: boolean;
  disabled?: boolean; // True if it's playing phase and not this board owner's turn/not active shooting board
}

export const BoardGrid: React.FC<BoardGridProps> = ({
  owner,
  ships,
  shots,
  phase,
  activeShipType,
  activeVertical,
  hoverCoordinate,
  onCellClick,
  onCellMouseEnter,
  onCellMouseLeave,
  showUnSunkShips,
  retro = false,
  disabled = false,
}) => {
  const letters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];

  // Check if a coordinate is part of the placement preview
  const getPlacementPreviewState = (r: number, c: number): { isPreview: boolean; isValid: boolean } => {
    if (owner !== 'player' || phase !== 'setup' || !activeShipType || !hoverCoordinate) {
      return { isPreview: false, isValid: false };
    }

    const size = getShipSize(activeShipType);
    const previewCoords = getShipCoordinates(hoverCoordinate.r, hoverCoordinate.c, size, activeVertical);
    
    const isPart = previewCoords.some((coord) => coord.r === r && coord.c === c);
    if (!isPart) return { isPreview: false, isValid: false };

    // Check if valid placement for all preview coordinates
    const isValid = previewCoords.every(coord => 
      coord.r >= 0 && coord.r < GRID_SIZE && coord.c >= 0 && coord.c < GRID_SIZE
    ) && previewCoords.every(pCoord => {
      // Must not collide with another placed ship (excluding current placing type if was already placed)
      return !ships.some(s => {
        if (s.type === activeShipType) return false; // ignore current
        const otherCoords = getShipCoordinates(s.r, s.c, getShipSize(s.type), s.vertical);
        return otherCoords.some(oc => oc.r === pCoord.r && oc.c === pCoord.c);
      });
    });

    return { isPreview: true, isValid };
  };

  return (
    <div className={`relative w-[280px] min-[370px]:w-[320px] min-[420px]:w-[365px] sm:w-[420px] md:w-[460px] mx-auto p-3.5 sm:p-5 rounded-3xl border-2 bg-slate-950/95 shadow-[0_4px_30px_rgba(0,0,0,0.4)] select-none font-mono transition-all duration-300
      ${owner === 'player' 
        ? (phase === 'playing' && disabled 
          ? 'border-teal-500/10 opacity-75 scale-[0.98]' 
          : 'border-teal-500/40 shadow-[0_0_25px_rgba(20,184,166,0.12)]')
        : (phase === 'playing' && disabled 
          ? 'border-slate-800 bg-slate-950/70 opacity-50 scale-[0.97] blur-[0.2px]' 
          : 'border-red-500/50 shadow-[0_0_30px_rgba(239,68,68,0.15)] ring-2 ring-red-500/20')}`}>
      
      {/* Decorative scanline sweep if retro mode enabled */}
      {retro && (
        <div className="absolute inset-0 pointer-events-none z-10 opacity-30 overflow-hidden">
          <div className="absolute w-full h-[3px] bg-teal-500/40 blur-[1px] top-0 animate-scan"></div>
          <div className="w-full h-full scanline"></div>
        </div>
      )}

      {/* Grid Headers and Coordinate labels */}
      <div className="w-full flex flex-col">
        {/* Top Alphabetic Labels (Column numbers 1 to 10) */}
        <div className="flex w-full mb-2">
          <div className="w-6 sm:w-7 h-6 flex items-center justify-center text-[10px] text-teal-500/30 font-bold"></div>
          {Array.from({ length: GRID_SIZE }).map((_, colIdx) => {
            const isHoveredCol = hoverCoordinate && hoverCoordinate.c === colIdx;
            return (
              <div
                key={`header-col-${colIdx}`}
                className={`flex-1 text-center text-[11px] sm:text-xs md:text-sm font-black transition-all duration-200 py-0.5 rounded
                  ${isHoveredCol 
                    ? 'text-amber-300 scale-125 bg-amber-500/15 border-b-2 border-amber-400 font-mono shadow-[0_2px_8px_rgba(245,158,11,0.2)]' 
                    : 'text-teal-400 font-bold'}`}
              >
                {colIdx + 1}
              </div>
            );
          })}
        </div>

        {/* Rows with numeric labels and actual Grid Cells */}
        {Array.from({ length: GRID_SIZE }).map((_, rowIdx) => {
          const isHoveredRow = hoverCoordinate && hoverCoordinate.r === rowIdx;
          return (
            <div key={`row-${rowIdx}`} className="flex w-full items-center mb-[4px] sm:mb-[5px]">
              {/* Left Row Header Letter (A to J) */}
              <div className={`w-6 sm:w-7 text-center text-xs md:text-sm font-black mr-2 transition-all duration-200 py-[3px] rounded-lg
                ${isHoveredRow 
                  ? 'text-amber-300 scale-125 bg-amber-500/15 border-r-2 border-amber-400 font-mono shadow-[2px_0_8px_rgba(245,158,11,0.2)] mr-1.5' 
                  : 'text-teal-400 font-bold'}`}>
                {letters[rowIdx]}
              </div>

              {/* Grid Cells */}
              <div className="flex-1 grid grid-cols-10 gap-[4px] sm:gap-[5px]">
                {Array.from({ length: GRID_SIZE }).map((_, colIdx) => {
                  const shot = shots.find((s) => s.r === rowIdx && s.c === colIdx);
                  const shipInfo = getShipAtCoordinate(rowIdx, colIdx, ships);
                  const shipInstance = shipInfo?.ship || null;

                  // Placement preview styling states
                  const { isPreview, isValid: isPreviewValid } = getPlacementPreviewState(rowIdx, colIdx);

                  // Determine visual cell values
                  const isHit = shot !== undefined && shot.hit;
                  const isMiss = shot !== undefined && !shot.hit;

                  // Show ships if:
                  // 1. It belongs to player
                  // 2. Or it belongs to computer and it is fully sunk
                  // 3. Or cheat/reveal option is enabled
                  const shouldShowShipSegment = shipInstance && (
                    showUnSunkShips || 
                    shipInstance.sunk ||
                    isHit
                  );

                  // Define custom accent color for ship
                  const shipDef = shipInstance ? SHIPS.find(s => s.type === shipInstance.type) : null;
                  const shipBgColor = shipDef ? shipDef.color : '#14b8a6';

                  // Border patterns to combine ship segments visually
                  let segmentBorderClasses = '';
                  if (shouldShowShipSegment && shipInstance && shipInfo) {
                    const { segmentIndex } = shipInfo;
                    const size = getShipSize(shipInstance.type);
                    const isVert = shipInstance.vertical;

                    if (size === 1) {
                      segmentBorderClasses = 'rounded-md';
                    } else if (segmentIndex === 0) {
                      // Head
                      segmentBorderClasses = isVert ? 'rounded-t-lg border-b-0' : 'rounded-l-lg border-r-0';
                    } else if (segmentIndex === size - 1) {
                      // Tail
                      segmentBorderClasses = isVert ? 'rounded-b-lg border-t-0' : 'rounded-r-lg border-l-0';
                    } else {
                      // Body
                      segmentBorderClasses = isVert ? 'border-y-0' : 'border-x-0';
                    }
                  }

                  // Check cell background hierarchy
                  return (
                    <div
                      id={`${owner}-cell-${rowIdx}-${colIdx}`}
                      key={`cell-${rowIdx}-${colIdx}`}
                      className={`
                        relative w-full aspect-square rounded-[4px] border transition-all duration-150 flex items-center justify-center overflow-hidden
                        ${isPreview 
                          ? (isPreviewValid ? '!bg-emerald-500/40 !border-emerald-300 animate-pulse ring-2 ring-emerald-500/30' : '!bg-red-500/40 !border-red-300 animate-pulse ring-2 ring-red-500/30') 
                          : isHit 
                            ? 'bg-red-950/45 border-red-500/60 shadow-[inset_0_0_6px_rgba(239,68,68,0.3)]' 
                            : isMiss 
                              ? 'bg-sky-950/40 border-sky-600/40' 
                              : 'bg-[#081513] border-teal-500/20 hover:border-teal-400/40'
                        }
                        ${phase === 'playing' && owner === 'computer' && !shot 
                          ? (disabled 
                            ? 'cursor-not-allowed opacity-80' 
                            : 'hover:bg-teal-500/25 hover:border-teal-300 cursor-crosshair hover:scale-[1.08] hover:shadow-[0_0_10px_rgba(20,184,166,0.2)]') 
                          : 'cursor-default'}
                      `}
                      onMouseEnter={() => !disabled && onCellMouseEnter && onCellMouseEnter(rowIdx, colIdx)}
                      onMouseLeave={() => !disabled && onCellMouseLeave && onCellMouseLeave()}
                      onClick={() => !disabled && onCellClick(rowIdx, colIdx)}
                    >
                      {/* Hover dynamic radar scope targeting ring */}
                      {phase === 'playing' && owner === 'computer' && !shot && !disabled && (
                        <div className="absolute inset-0 w-full h-full bg-radial from-teal-400/10 to-transparent opacity-0 hover:opacity-100 transition-opacity duration-200"></div>
                      )}

                      {/* Ship Segment visual representation with Solid Contrast colors */}
                      {shouldShowShipSegment && shipInstance && (
                        <div
                          style={{ 
                            backgroundColor: isHit ? `${shipBgColor}33` : `${shipBgColor}d5`, // Opaque solid contrast
                            borderColor: shipInstance.sunk ? '#ef4444' : '#ffffff',
                            boxShadow: shipInstance.sunk 
                              ? '0 0 10px rgba(239,68,68,0.5), inset 0 0 10px rgba(239,68,68,0.4)' 
                              : `0 0 8px ${shipBgColor}60`
                          }}
                          className={`
                            absolute inset-[2px] sm:inset-[3px] border-2 transition-all duration-300 flex items-center justify-center
                            ${segmentBorderClasses}
                          `}
                        >
                          {/* Anchor icon on head of ships */}
                          {shipInfo?.segmentIndex === 0 && !isHit && (
                            <Anchor className="w-3.5 h-3.5 text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)]" />
                          )}
                        </div>
                      )}

                      {/* 1. HIT MARKER EFFECT */}
                      {isHit && (
                        <div className="absolute inset-0 z-10 flex items-center justify-center bg-red-950/20">
                          {/* Exploding dynamic pulse ring */}
                          <span className="absolute inline-flex h-full w-full rounded-full bg-red-500/40 opacity-75 animate-ping"></span>
                          
                          {shipInstance?.sunk ? (
                            <ShieldAlert className="w-5 h-5 text-red-500 animate-bounce drop-shadow-[0_0_8px_#ef4444]" />
                          ) : (
                            <Flame className="w-5 h-5 text-amber-500 animate-pulse drop-shadow-[0_0_8px_rgba(245,158,11,0.8)]" />
                          )}
                        </div>
                      )}

                      {/* 2. MISS MARKER (Crisp splash symbol) */}
                      {isMiss && (
                        <div className="absolute w-2.5 h-2.5 sm:w-3.5 sm:h-3.5 rounded-full border-2 border-sky-400 bg-sky-950/90 shadow-[0_0_8px_rgba(56,189,248,0.8)] flex items-center justify-center animate-pulse">
                          <div className="w-1 h-1 rounded-full bg-white"></div>
                        </div>
                      )}

                      {/* Floating center target icon on mouse hover */}
                      {phase === 'playing' && owner === 'computer' && !shot && !disabled && (
                        <div className="absolute inset-0 opacity-0 hover:opacity-100 flex items-center justify-center transition-opacity duration-200 bg-teal-950/30">
                          <Target className="w-6 h-6 text-teal-300 rotate-45 transform hover:scale-110 active:scale-90 transition-transform duration-100 drop-shadow-[0_0_8px_rgba(20,184,166,0.8)]" />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
