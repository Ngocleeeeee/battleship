import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Terminal, Radio, Eye } from 'lucide-react';
import { GameLog } from '../types';

interface CommandCenterProps {
  logs: GameLog[];
  accuracy: number;
  score: number;
}

export const CommandCenter: React.FC<CommandCenterProps> = ({ logs, accuracy, score }) => {
  const logsContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll local scrollable log div directly without moving the entire browser window
  useEffect(() => {
    if (logsContainerRef.current) {
      logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
    }
  }, [logs]);

  // Map log types to color/icon styles
  const getLogStyles = (type: GameLog['type']) => {
    switch (type) {
      case 'player-hit':
        return {
          bg: 'bg-emerald-950/20 border-emerald-500/10',
          text: 'text-emerald-400',
          indicator: 'bg-emerald-500 shadow-[0_0_8px_#10b981]',
          prefix: '[TẤN CÔNG CHÍNH XÁC]'
        };
      case 'player-miss':
        return {
          bg: 'bg-teal-950/10 border-teal-500/5',
          text: 'text-teal-500/80',
          indicator: 'bg-teal-500/40',
          prefix: '[TẤN CÔNG BỊ TRƯỢT]'
        };
      case 'enemy-hit':
        return {
          bg: 'bg-amber-950/20 border-amber-500/10',
          text: 'text-amber-400',
          indicator: 'bg-amber-500 shadow-[0_0_8px_#f59e0b] animate-bounce',
          prefix: '[CẢNH BÁO BỊ BẮN]'
        };
      case 'enemy-miss':
        return {
          bg: 'bg-slate-900/30 border-slate-700/10',
          text: 'text-slate-400',
          indicator: 'bg-slate-500/20',
          prefix: '[ĐỊCH BẮN HỎNG]'
        };
      case 'sunk':
        return {
          bg: 'bg-red-950/30 border-red-500/20 shadow-[inset_0_0_12px_rgba(239,68,68,0.1)] animate-alert',
          text: 'text-red-400 font-bold',
          indicator: 'bg-red-500 shadow-[0_0_10px_#ef4444]',
          prefix: '[ĐÃ HỦY DIỆT LỰC LƯỢNG]'
        };
      default:
        return {
          bg: 'bg-slate-950/40 border-slate-800',
          text: 'text-slate-300',
          indicator: 'bg-sky-500',
          prefix: '[KẾT NỐI TÍN HIỆU]'
        };
    }
  };

  return (
    <div className="flex flex-col h-[280px] bg-slate-950/80 rounded-2xl border-2 border-teal-500/30 text-mono relative shadow-[0_0_25px_rgba(20,184,166,0.05)] overflow-hidden">
      {/* CommandCenter Decorative Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-slate-900/80 border-b border-teal-500/20 select-none">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-teal-400 animate-pulse" />
          <span className="text-xs font-bold uppercase tracking-wider text-teal-300">
            Trung tâm Chỉ huy Chiến thuật
          </span>
        </div>
        <div className="flex gap-4 items-center">
          <div className="flex items-center gap-1">
            <Radio className="w-3.5 h-3.5 text-emerald-400 animate-ping" />
            <span className="text-[10px] text-emerald-400 uppercase tracking-widest">
              Live Feed
            </span>
          </div>
        </div>
      </div>

      {/* Combat Analytics bar */}
      <div className="grid grid-cols-2 bg-slate-900/30 border-b border-teal-500/10 px-4 py-1.5 text-xs text-teal-500/60 select-none">
        <div>Hiệu suất khai hỏa: <span className="text-teal-300 font-bold">{accuracy}%</span></div>
        <div className="text-right">Điểm tấn công: <span className="text-teal-300 font-bold">{score}</span></div>
      </div>

      {/* Message Feed Canvas */}
      <div ref={logsContainerRef} className="flex-1 p-3.5 overflow-y-auto space-y-2.5">
        {logs.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-teal-500/30 select-none gap-2">
            <Eye className="w-8 h-8 opacity-40 animate-pulse-glow" />
            <p className="text-xs text-center uppercase tracking-widest max-w-[200px]">
              Đang đợi mệnh lệnh. Giao chiến để cập nhật nhật ký thực địa...
            </p>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {logs.map((log) => {
              const styles = getLogStyles(log.type);
              return (
                <motion.div
                  id={`tactical-log-${log.id}`}
                  key={log.id}
                  initial={{ opacity: 0, y: 12, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18, ease: 'easeOut' }}
                  className={`flex gap-3 p-2.5 rounded-lg border text-xs gap-2 leading-relaxed tracking-wide ${styles.bg}`}
                >
                  {/* Status Indicator Dot */}
                  <div className="pt-1 flex-shrink-0">
                    <div className={`w-2 h-2 rounded-full ${styles.indicator}`}></div>
                  </div>

                  {/* Log timestamp, role prefix and message */}
                  <div className="flex-1 flex flex-col gap-0.5">
                    <div className="flex items-center justify-between text-[10px] opacity-60">
                      <span className={`${styles.text} font-bold tracking-widest`}>
                        {styles.prefix}
                      </span>
                      <span>{log.timestamp}</span>
                    </div>
                    <p className={`text-[12px] font-medium leading-relaxed ${styles.text}`}>
                      {log.message}
                    </p>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
};
