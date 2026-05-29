import React from 'react';
import { RotateCw, Sparkles, RefreshCw, CheckCircle2, Circle } from 'lucide-react';
import { SHIPS, ShipType, ShipInstance, ShipDefinition } from '../types';
import { getShipSize } from '../utils/gameLogic';

interface ShipSelectorProps {
  ships: ShipInstance[];
  activeShipType: ShipType | null;
  activeVertical: boolean;
  onSelectShip: (type: ShipType) => void;
  onToggleOrientation: () => void;
  onAutoPlace: () => void;
  onClearBoard: () => void;
}

export const ShipSelector: React.FC<ShipSelectorProps> = ({
  ships,
  activeShipType,
  activeVertical,
  onSelectShip,
  onToggleOrientation,
  onAutoPlace,
  onClearBoard,
}) => {
  // Check if a specific ship type is already placed on the board
  const isPlaced = (type: ShipType): boolean => {
    return ships.some((s) => s.type === type);
  };

  return (
    <div className="flex flex-col gap-5 p-5 bg-slate-950/80 rounded-2xl border-2 border-teal-500/30 text-mono relative shadow-[0_0_25px_rgba(20,184,166,0.05)]">
      {/* Decors */}
      <div className="absolute top-1.5 right-3 text-[10px] text-teal-500/30 font-bold uppercase select-none tracking-wider">
        Fleet Configurator
      </div>

      <div className="flex items-center gap-2 mb-1">
        <Sparkles className="w-5 h-5 text-teal-400" />
        <h3 className="text-md font-bold uppercase tracking-wider text-teal-300">
          Cấu hình Hạm đội
        </h3>
      </div>

      {/* Ship List */}
      <div className="flex flex-col gap-3">
        {SHIPS.map((ship: ShipDefinition) => {
          const placed = isPlaced(ship.type);
          const active = activeShipType === ship.type;

          return (
            <button
              id={`ship-select-btn-${ship.type}`}
              key={ship.type}
              onClick={() => onSelectShip(ship.type)}
              className={`
                w-full p-3 rounded-lg border text-left flex items-center justify-between transition-all duration-200 group
                ${active 
                  ? 'bg-teal-500/20 border-teal-400 text-teal-100 shadow-[0_0_12px_rgba(20,184,166,0.15)] scale-[1.01]' 
                  : placed
                    ? 'bg-slate-900/30 border-teal-600/30 text-teal-500/60'
                    : 'bg-slate-900/50 border-teal-950/80 hover:border-teal-400/50 text-teal-300 hover:bg-slate-900/80'
                }
              `}
            >
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  {placed ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <Circle className={`w-4 h-4 ${active ? 'text-teal-400 fill-teal-400/20' : 'text-teal-600'}`} />
                  )}
                  <span className="text-sm font-bold tracking-tight">{ship.name}</span>
                </div>
                
                {/* Custom Block Cells to represent size visually */}
                <div className="flex gap-1.5 mt-1.5 pl-6">
                  {Array.from({ length: ship.size }).map((_, idx) => (
                    <div
                      key={`block-${ship.type}-${idx}`}
                      style={{ backgroundColor: placed ? '#0f766e40' : ship.color }}
                      className={`
                        w-4 h-3 rounded-[2px] transition-all duration-300
                        ${active ? 'ring-1 ring-white/30 scale-105' : ''}
                        ${placed ? 'opacity-40 border border-teal-500/20' : ''}
                      `}
                    ></div>
                  ))}
                </div>
              </div>

              <div className="text-right text-xs pr-1 flex flex-col items-end gap-1 font-mono">
                <span className={`font-bold ${active ? 'text-teal-300' : 'text-teal-400/80'}`}>
                  Cỡ: {ship.size}ô
                </span>
                <span className="text-[10px] text-teal-500/40">
                  {placed ? 'Đã bố trí' : 'Sẵn sàng'}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Orientation controls & General shortcuts */}
      <div className="flex flex-col gap-2.5 pt-4 border-t border-teal-500/20">
        <div className="flex justify-between items-center text-xs text-teal-500/50 mb-1">
          <span>Phím xoay nhanh: <strong>[Space/R]</strong></span>
          <span>Đã xếp: {ships.length}/5</span>
        </div>

        {/* Rotate Button */}
        <button
          id="toggle-orientation-btn"
          onClick={onToggleOrientation}
          disabled={!activeShipType}
          className={`
            w-full py-2.5 px-4 rounded-lg flex items-center justify-center gap-2 font-bold text-sm tracking-wide uppercase transition-all duration-200
            ${activeShipType
              ? 'bg-teal-500 text-slate-950 shadow-[0_4px_12px_rgba(20,184,166,0.25)] hover:bg-teal-400 cursor-pointer active:translate-y-px' 
              : 'bg-slate-900 border border-slate-800 text-teal-900/40 cursor-not-allowed'
            }
          `}
        >
          <RotateCw className="w-4 h-4 animate-spin-slow" />
          Chiều: {activeVertical ? 'Dọc (Dọc)' : 'Ngang (Ngang)'}
        </button>

        {/* Action button Grid */}
        <div className="grid grid-cols-2 gap-2 mt-1">
          {/* Auto Place */}
          <button
            id="auto-place-btn"
            onClick={onAutoPlace}
            className="py-2 px-3 text-xs bg-slate-900 hover:bg-slate-800 border border-teal-500/20 hover:border-teal-400/40 text-teal-300 rounded-lg flex items-center justify-center gap-1.5 transition-all active:scale-95 cursor-pointer font-bold uppercase tracking-wider"
          >
            <Sparkles className="w-3.5 h-3.5 text-teal-400" />
            Random xếp
          </button>

          {/* Wipe Board */}
          <button
            id="clear-board-btn"
            onClick={onClearBoard}
            disabled={ships.length === 0}
            className={`
              py-2 px-3 text-xs rounded-lg flex items-center justify-center gap-1.5 transition-all uppercase font-bold tracking-wider
              ${ships.length > 0
                ? 'bg-red-950/30 hover:bg-red-950/50 border border-red-500/30 text-red-400 hover:border-red-400/50 active:scale-95 cursor-pointer'
                : 'bg-slate-950 border border-slate-900 text-teal-950/30 cursor-not-allowed'
              }
            `}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Xóa sạch
          </button>
        </div>
      </div>
    </div>
  );
};
