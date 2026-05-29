import { useState, useEffect, useCallback, useRef, FormEvent } from 'react';
import { io, Socket } from 'socket.io-client';
import { 
  Play, Volume2, VolumeX, Eye, EyeOff, AlertTriangle, 
  Trophy, Shield, HelpCircle, Sparkles, RefreshCw, Sliders, FlameKindling, Info, 
  Users, User, Radio, ArrowLeft, Gamepad2, Send, Copy, Check, LogOut, Swords
} from 'lucide-react';
import { BoardGrid } from './components/BoardGrid';
import { ShipSelector } from './components/ShipSelector';
import { CommandCenter } from './components/CommandCenter';
import { 
  SHIPS, GRID_SIZE, ShipInstance, ShipType, Shot, 
  GamePhase, GameLog, Coordinate 
} from './types';
import { 
  playSonarPing, playPlaceShip, playRotateShip, playLaunchShot, 
  playHitExplosion, playMissSplash, playSunkAlarm, playVictoryChime, 
  playDefeatDrone, setMute as setAudioMute, getMute as getAudioMute 
} from './utils/audio';
import { 
  canPlaceShip, generateRandomBoard, getShipAtCoordinate, 
  getShipSize, getNextAIShot, isShipSunk 
} from './utils/gameLogic';

export default function App() {
  // Navigation & Multi-mode states
  const [gameMode, setGameMode] = useState<'offline' | 'online' | null>(null);
  const [username, setUsername] = useState<string>('');
  
  // Game Status Phases
  const [gamePhase, setGamePhase] = useState<GamePhase>('setup');
  const [playerShips, setPlayerShips] = useState<ShipInstance[]>([]);
  const [computerShips, setComputerShips] = useState<ShipInstance[]>([]);
  const [playerShots, setPlayerShots] = useState<Shot[]>([]);
  const [computerShots, setComputerShots] = useState<Shot[]>([]);
  const [turn, setTurn] = useState<'player' | 'computer' | string>('player'); // Holds socket ID for online turn

  // Tactical Controls
  const [activeShipType, setActiveShipType] = useState<ShipType | null>('carrier');
  const [activeVertical, setActiveVertical] = useState<boolean>(false);
  const [hoverCoordinate, setHoverCoordinate] = useState<Coordinate | null>(null);
  const [cheatMode, setCheatMode] = useState<boolean>(false);
  const [muted, setMuted] = useState<boolean>(false);
  const [aiShotDelay, setAiShotDelay] = useState<number>(600);
  const [logs, setLogs] = useState<GameLog[]>([]);
  const [retroEffects, setRetroEffects] = useState<boolean>(false);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [onlineStatus, setOnlineStatus] = useState<'lobby' | 'matchmaking' | 'room' | 'ready_wait' | 'playing' | 'gameover'>('lobby');
  const [roomId, setRoomId] = useState<string>('');
  const [roomInput, setRoomInput] = useState<string>('');
  const [onlinePlayers, setOnlinePlayers] = useState<{ id: string; username: string; ready?: boolean }[]>([]);
  const [copied, setCopied] = useState<boolean>(false);
  const [forfeitMessage, setForfeitMessage] = useState<string | null>(null);

  // Lock for local AI state machine
  const aiThinkingRef = useRef<boolean>(false);

  // Sound verification ping sound effect
  const handleSonarTest = () => {
    playSonarPing();
  };

  // Sound system toggle config
  const handleToggleMute = () => {
    const newMuted = !muted;
    setMuted(newMuted);
    setAudioMute(newMuted);
    if (!newMuted) {
      playSonarPing();
    }
  };

  // Shared combat tactical logs generator
  const addLog = useCallback((message: string, type: GameLog['type'] = 'info') => {
    const timestamp = new Date().toLocaleTimeString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    const newLog: GameLog = {
      id: Math.random().toString(36).substr(2, 9),
      timestamp,
      message,
      type,
    };
    setLogs((prev) => [...prev, newLog]);
  }, []);

  // Sync general usernames on mounting
  useEffect(() => {
    const storedName = localStorage.getItem('battleship_admiral_name');
    if (storedName) {
      setUsername(storedName);
    } else {
      const randomName = `Đô Đốc #${Math.floor(Math.random() * 9000 + 1000)}`;
      setUsername(randomName);
    }

    // Play sonar when they click anywhere initially to enable Web Audio
    const handleInitialPing = () => {
      playSonarPing();
      window.removeEventListener('click', handleInitialPing);
    };
    window.addEventListener('click', handleInitialPing);
    return () => window.removeEventListener('click', handleInitialPing);
  }, []);

  // Save nickname to localStorage
  const handleNameChange = (val: string) => {
    setUsername(val);
    localStorage.setItem('battleship_admiral_name', val);
  };

  // Orientation togglers
  const handleToggleOrientation = useCallback(() => {
    setActiveVertical((prev) => !prev);
    playRotateShip();
  }, []);

  // Orientation shortcut triggers (Spacebar & R) during setups
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (gamePhase !== 'setup' || !activeShipType) return;
      if (e.key === ' ' || e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        handleToggleOrientation();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [gamePhase, activeShipType, handleToggleOrientation]);

  // Setup smart picker to guide active placements
  const selectNextAvailableShip = useCallback((currentShips: ShipInstance[]) => {
    const placedTypes = currentShips.map((s) => s.type);
    const available = SHIPS.find((s) => !placedTypes.includes(s.type));
    if (available) {
      setActiveShipType(available.type);
    } else {
      setActiveShipType(null); // All placed!
    }
  }, []);

  // Cell position preview triggers
  const handleCellMouseEnter = (r: number, c: number) => {
    if (gamePhase === 'setup') {
      setHoverCoordinate({ r, c });
    }
  };

  const handleCellMouseLeave = () => {
    setHoverCoordinate(null);
  };

  // Set randomized placements for standard local client
  const handleAutoPlacePlayer = () => {
    const randomShips = generateRandomBoard();
    setPlayerShips(randomShips);
    setActiveShipType(null);
    playPlaceShip();
    addLog('Hạm đội của bạn đã được triển khai tự động ngẫu nhiên bởi Tổng tham mưu!', 'info');
  };

  // Restart board states
  const handleClearPlayerBoard = () => {
    setPlayerShips([]);
    setActiveShipType(SHIPS[0].type); // restart selector first
    playRotateShip();
    addLog('Quân cảng đã được giải phóng toàn bộ chiến thuyền.', 'info');
  };

  // Build client socket connection & state synchronization engine
  useEffect(() => {
    if (gameMode !== 'online') {
      if (socket) {
        socket.disconnect();
        setSocket(null);
      }
      return;
    }

    // Instanciate socket
    const s = io();
    setSocket(s);

    s.on('connect', () => {
      console.log('[NET] Linked directly with battleship node:', s.id);
    });

    s.on('matchmaking_queued', () => {
      setOnlineStatus('matchmaking');
      setLogs([]);
      addLog('📡 Đã kết nối radar toàn cầu. Đang tìm phòng thủ quân đối phương...', 'info');
    });

    s.on('matchmaking_canceled', () => {
      setOnlineStatus('lobby');
      addLog('Hủy tìm trận thành công.', 'info');
    });

    s.on('room_created', ({ roomId, players }: { roomId: string; players: typeof onlinePlayers }) => {
      setRoomId(roomId);
      setOnlinePlayers(players);
      setOnlineStatus('room');
      addLog(`🔑 Đã kiến thiết kênh chỉ huy mật. Mã Code: ${roomId}. Đang chờ đối phương nhảy phòng chiến sự...`, 'info');
    });

    s.on('lobby_update', ({ players }: { players: typeof onlinePlayers }) => {
      setOnlinePlayers(players);
    });

    s.on('match_found', ({ roomId, players }: { roomId: string; players: typeof onlinePlayers }) => {
      setRoomId(roomId);
      setOnlinePlayers(players);
      setOnlineStatus('setup');
      setGamePhase('setup');
      setPlayerShips([]);
      setComputerShips([]);
      setPlayerShots([]);
      setComputerShots([]);
      setActiveShipType('carrier');
      setForfeitMessage(null);
      
      const opp = players.find(p => p.id !== s.id);
      addLog(`⚓ TRẬN ĐỊA THIẾT LẬP: Khởi hành giáp chiến với Đô đốc [${opp?.username || 'Kẻ thù'}].`, 'sunk');
      addLog('Bố trí hạm đội của hạm tại bản đồ biển quốc gia!', 'info');
      playSonarPing();
    });

    s.on('player_ready_state', ({ readyStates }: { readyStates: { id: string; ready: boolean }[] }) => {
      // Direct mappings
      setOnlinePlayers(prev => prev.map(p => {
        const match = readyStates.find(rs => rs.id === p.id);
        return match ? { ...p, ready: match.ready } : p;
      }));

      const oppState = readyStates.find(rs => rs.id !== s.id);
      if (oppState?.ready) {
        addLog('📡 Trạm radar mật thám báo hiệu: Hạm đội địch ĐÃ SẴN SÀNG bến đỗ!', 'info');
      }
    });

    s.on('game_started', ({ turn: startingTurn }: { turn: string }) => {
      setOnlineStatus('playing');
      setGamePhase('playing');
      setTurn(startingTurn);
      setLogs([]); // Refresh for logs
      
      playSonarPing();
      addLog('🔔 CÒI CHIẾN TRANH KHAI HỎA! Cả 2 hạm đội đã sẵn sàng nổ súng liên tục.', 'sunk');
      
      if (startingTurn === s.id) {
        addLog('QUYỀN KHAI HỎA THUỘC VỀ BẠN! Nhấp chuột bắn nã ngay!', 'player-hit');
      } else {
        addLog('ĐỊCH GIÀNH ĐƯỢC QUYỀN KHAI HỎA TRƯỚC. Thiết lập phòng bị chặt chẽ!', 'enemy-hit');
      }
    });

    s.on('shot_result', ({ shooterId, r, c, hit, sunkShip, nextTurn }: {
      shooterId: string; r: number; c: number; hit: boolean; sunkShip?: ShipType; nextTurn: string;
    }) => {
      setTurn(nextTurn);
      playLaunchShot();

      const letters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
      const targetCoords = `[${letters[r]}${c + 1}]`;

      setTimeout(() => {
        if (shooterId === s.id) {
          // Player fired
          const shotResult: Shot = { r, c, hit, shipType: sunkShip };
          setPlayerShots(prev => [...prev, shotResult]);

          if (hit) {
            playHitExplosion();
            if (sunkShip) {
              playSunkAlarm();
              const shipDef = SHIPS.find(ship => ship.type === sunkShip);
              addLog(`💥 CHIẾN CÔNG CỰC ĐẠI! Bạn đánh chìm hoàn toàn tàu ${shipDef?.name} của hạm đội địch tại ô ${targetCoords}!`, 'sunk');
            } else {
              addLog(`🎯 BẮN TRÚNG MỤC TIÊU! Phát đạn hỏa tiễn dội chuẩn xác vào tàu đối phương tại ô ${targetCoords}! Bắn tiếp!`, 'player-hit');
            }
          } else {
            playMissSplash();
            addLog(`💦 TRƯỢT MẤT! Đạn pháo bay vọt rớt nước tại ô ${targetCoords}. Nhường tháp điều khiển súng cho địch.`, 'player-miss');
          }
        } else {
          // Enemy fired at player's board
          const shotResult: Shot = { r, c, hit, shipType: sunkShip };
          setComputerShots(prev => [...prev, shotResult]);

          // Update local damage segments on playerShips
          setPlayerShips(prevShips => {
            const shipAtCoord = getShipAtCoordinate(r, c, prevShips);
            if (shipAtCoord) {
              const updated = [...prevShips];
              updated[shipAtCoord.index].hits[shipAtCoord.segmentIndex] = true;
              if (updated[shipAtCoord.index].hits.every(h => h)) {
                updated[shipAtCoord.index].sunk = true;
              }
              return updated;
            }
            return prevShips;
          });

          if (hit) {
            playHitExplosion();
            if (sunkShip) {
              playSunkAlarm();
              const shipDef = SHIPS.find(ship => ship.type === sunkShip);
              addLog(`🚨 BÁO NGUY CẤP BÁCH: Thủy quân báo cáo tàu ${shipDef?.name} của ta ĐÃ BỊ ĐÁNH CHÌM tại ô ${targetCoords}!`, 'sunk');
            } else {
              addLog(`🔥 TA BỊ BẮN TRÚNG! Khói tỏa nghi ngút từ mạn hạm cảng của ta tại ô ${targetCoords}!`, 'enemy-hit');
            }
          } else {
            playMissSplash();
            addLog(`🛡️ PHÒNG THỦ AN TOÀN! Khẩu bắn ác chiến của địch trượt phao chệch dòng nước rớt sình tại ô ${targetCoords}!`, 'enemy-miss');
          }
        }
      }, 500);
    });

    s.on('game_over', ({ winnerId, abandoned, message }: { winnerId: string; abandoned?: boolean; message?: string }) => {
      setGamePhase(winnerId === s.id ? 'victory' : 'defeat');
      setOnlineStatus('gameover');
      
      if (winnerId === s.id) {
        playVictoryChime();
        if (abandoned && message) {
          setForfeitMessage(message);
          addLog(`🏆 CHIẾN THẮNG KỶ LỤC: ${message}`, 'sunk');
        } else {
          addLog('🏆 THỐNG TRỊ THÁI BÌNH DƯƠNG: Đô Đốc dũng cảm lập chiến công đập tan tất cả kẻ địch!', 'sunk');
        }
      } else {
        playDefeatDrone();
        addLog('💀 THẤT BẠI TRƯỚC SỨC ÉP: Hạm đội đã thất thoát toàn vẹn binh lực dưới nòng súng quân thù.', 'sunk');
      }
    });

    s.on('player_disconnected', ({ id }: { id: string }) => {
      const p = onlinePlayers.find(pl => pl.id === id);
      addLog(`⚠️ Đô Đốc đối phương [${p?.username || 'Kẻ thù'}] bị mất kết nối vô tuyến...`, 'enemy-miss');
    });

    return () => {
      s.disconnect();
    };
  }, [gameMode]);

  // Click place ship handler (supports both single & multi setup stages)
  const placePlayerShip = (r: number, c: number) => {
    if (!activeShipType) {
      addLog('Hãy chọn thiết kích hạm trên bến cảng để bố trí đặt bến!', 'info');
      return;
    }

    const size = getShipSize(activeShipType);
    if (canPlaceShip(r, c, size, activeVertical, playerShips, activeShipType)) {
      const newShip: ShipInstance = {
        type: activeShipType,
        r,
        c,
        vertical: activeVertical,
        hits: new Array(size).fill(false),
        sunk: false,
      };

      const filteredShips = playerShips.filter((s) => s.type !== activeShipType);
      const updatedShips = [...filteredShips, newShip];
      
      setPlayerShips(updatedShips);
      playPlaceShip();
      
      const shipDef = SHIPS.find((s) => s.type === activeShipType);
      addLog(`Hạ thủy bố trí hạm [${shipDef?.name}] vững chãi tại ô [${String.fromCharCode(65 + r)}${c + 1}]!`, 'info');

      selectNextAvailableShip(updatedShips);
    } else {
      addLog('Không thể nằm đè chồng phao hoặc vươn ngoài bến phao quân đội!', 'enemy-miss');
    }
  };

  // Launch offline / computer battlefield
  const handleStartGameOffline = () => {
    if (playerShips.length < 5) {
      addLog('Hãy bố trí đủ 5 kiểu chiến tàu quân đội trước khi khai hỏa báo động!', 'enemy-miss');
      return;
    }

    const compRandomShips = generateRandomBoard();
    setComputerShips(compRandomShips);

    setPlayerShots([]);
    setComputerShots([]);
    setTurn('player');
    setGamePhase('playing');
    setLogs([]);
    
    playSonarPing();
    addLog('🔔 BÁO ĐỘNG ĐỎ! Toàn bộ khu liên hợp hải quân chuyển trạng thái nổ súng tiễu trừ AI hải tặc!', 'sunk');
  };

  // Toggle client Ready status for Online Multiplayer
  const handleReadyOnline = () => {
    if (playerShips.length < 5) {
      addLog('Triển khai nốt toàn bộ 5 tàu chiến trong quân hạm mới đủ điều kiện hạ lệnh SẴN SÀNG!', 'enemy-miss');
      return;
    }

    if (socket && roomId) {
      socket.emit('player_ready', { roomId, ships: playerShips });
      setOnlineStatus('ready_wait');
      addLog('⌛ Khai hỏa báo hiệu đã chuẩn bị chiến xong hạm đội! Đang chờ đối thủ xếp tàu thủy...', 'info');
    }
  };

  // Human click attack coordinate on Opponent's radar ocean
  const handleCellClickFire = (r: number, c: number) => {
    if (gamePhase !== 'playing') return;

    if (gameMode === 'online') {
      if (turn !== socket?.id) {
        addLog('Báo cáo Đô đốc, đang ngoài lượt chỉ huy! Hệ thống sáp súng đang nạp lò sưởi đạn...', 'info');
        return;
      }
      
      const alreadyShot = playerShots.some(s => s.r === r && s.c === c);
      if (alreadyShot) {
        addLog('Tọa độ này đã phóng lửa hỏa dược trước đó rồi, Đô Đốc!', 'info');
        return;
      }

      if (socket && roomId) {
        socket.emit('player_fire', { roomId, r, c });
      }
    } else {
      // Offline mode firing
      if (turn !== 'player') return;

      const alreadyShot = playerShots.some((s) => s.r === r && s.c === c);
      if (alreadyShot) {
        addLog('Tọa độ này đã dội bão bom bão lũ phá rồi!', 'info');
        return;
      }

      playLaunchShot();

      const shipAtCoord = getShipAtCoordinate(r, c, computerShips);
      const hit = shipAtCoord !== null;
      let shotResult: Shot;

      if (hit && shipAtCoord) {
        const { ship, index, segmentIndex } = shipAtCoord;
        const updatedShips = [...computerShips];
        updatedShips[index].hits[segmentIndex] = true;

        const shipSunk = updatedShips[index].hits.every(h => h);
        
        if (shipSunk) {
          updatedShips[index].sunk = true;
          shotResult = { r, c, hit: true, shipType: ship.type };
          setComputerShips(updatedShips);
          setPlayerShots((prev) => [...prev, shotResult]);
          
          playSunkAlarm();
          const shipDef = SHIPS.find(s => s.type === ship.type);
          addLog(`💥 CHIẾN THẮNG TRẬN HUỶ: Bạn dội bão chìm hoàn toàn [${shipDef?.name}] quân địch tại ô [${String.fromCharCode(65 + r)}${c + 1}]!`, 'sunk');

          const allCompSunk = updatedShips.every((s) => s.sunk);
          if (allCompSunk) {
            setGamePhase('victory');
            playVictoryChime();
            addLog('🏆 DANH TIẾNG CHIẾN THẮNG: Đô Đốc xuất sắc quét sạch 5 bến tàu giặc, thăng cấp Thống chế hạm chiến!', 'sunk');
          }
        } else {
          shotResult = { r, c, hit: true, shipType: ship.type };
          setComputerShips(updatedShips);
          setPlayerShots((prev) => [...prev, shotResult]);
          
          playHitExplosion();
          addLog(`🎯 PHÁ HỦY CHÍNH XÁC! Thiết giáp hạm cơ động địch rung lắc dữ dội tại [${String.fromCharCode(65 + r)}${c + 1}]. Bắn dồn tiếp!`, 'player-hit');
        }
        
        setTurn('player');
      } else {
        shotResult = { r, c, hit: false };
        setPlayerShots((prev) => [...prev, shotResult]);
        
        playMissSplash();
        addLog(`💦 HỤT TRONG NUỐC! Bia bắn trượt ngoài khơi súng mạn tại [${String.fromCharCode(65 + r)}${c + 1}]. Đổi phiên súng cho AI địch.`, 'player-miss');
        
        setTurn('computer');
      }
    }
  };

  // LOCAL offline AI firing automation loops
  useEffect(() => {
    if (gameMode === 'online' || gamePhase !== 'playing' || turn !== 'computer' || aiThinkingRef.current) return;

    aiThinkingRef.current = true;

    const timer = setTimeout(() => {
      const coord = getNextAIShot(playerShips, computerShots);
      const { r, c } = coord;

      playLaunchShot();

      const attackTimer = setTimeout(() => {
        const shipAtCoord = getShipAtCoordinate(r, c, playerShips);
        const hit = shipAtCoord !== null;
        let shotResult: Shot;

        if (hit && shipAtCoord) {
          const { ship, index, segmentIndex } = shipAtCoord;
          const updatedShips = [...playerShips];
          updatedShips[index].hits[segmentIndex] = true;

          const shipSunk = updatedShips[index].hits.every((h) => h);

          if (shipSunk) {
            updatedShips[index].sunk = true;
            shotResult = { r, c, hit: true, shipType: ship.type };
            setPlayerShips(updatedShips);
            setComputerShots((prev) => [...prev, shotResult]);

            playSunkAlarm();
            const shipDef = SHIPS.find(s => s.type === ship.type);
            addLog(`🚨 TRẠM THÔNG TIN BÁO NGUY: Quân hải tặc AI đã đánh chìm tàu [${shipDef?.name}] của ta tại [${String.fromCharCode(65 + r)}${c + 1}]!`, 'sunk');

            const allPlayerSunk = updatedShips.every((s) => s.sunk);
            if (allPlayerSunk) {
              setGamePhase('defeat');
              playDefeatDrone();
              addLog('💀 CHIẾN BẠI: Toàn bộ hạm biển đã tan vỡ rụng rủ. Rút quân bảo vệ căn cứ đất liền.', 'sunk');
            }
          } else {
            shotResult = { r, c, hit: true, shipType: ship.type };
            setPlayerShips(updatedShips);
            setComputerShots((prev) => [...prev, shotResult]);

            playHitExplosion();
            const shipDef = SHIPS.find(s => s.type === ship.type);
            addLog(`🔥 CHÁY LỚN: Pháo kích AI dội trúng vị trí chiếc ${shipDef?.name} tại ô [${String.fromCharCode(65 + r)}${c + 1}].`, 'enemy-hit');
          }
          
          setTurn('computer');
        } else {
          shotResult = { r, c, hit: false };
          setComputerShots((prev) => [...prev, shotResult]);

          playMissSplash();
          addLog(`🛡️ PHÁO BAY LỆCH: AI bắn hụt tạo cột nước biển vô hại cách bến tàu quân ta tại ô [${String.fromCharCode(65 + r)}${c + 1}].`, 'enemy-miss');

          setTurn('player');
        }

        aiThinkingRef.current = false;
      }, 500);

      return () => clearTimeout(attackTimer);
    }, aiShotDelay);

    return () => {
      clearTimeout(timer);
      aiThinkingRef.current = false;
    };
  }, [gameMode, gamePhase, turn, playerShips, computerShots, aiShotDelay, addLog]);

  // Restart offline campaign
  const handleRestartOffline = () => {
    setPlayerShips([]);
    setComputerShips([]);
    setPlayerShots([]);
    setComputerShots([]);
    setGamePhase('setup');
    setTurn('player');
    setActiveShipType('carrier');
    setActiveVertical(false);
    setHoverCoordinate(null);
    setLogs([]);
    
    playSonarPing();
    addLog('Đường liên lạc phục hồi. Hãy bắt đầu dàn quân bố hạm đội thủy!', 'info');
  };

  // Exit back to main welcome dashboard
  const handleExitToWelcome = () => {
    if (socket) {
      socket.disconnect();
      setSocket(null);
    }
    setGameMode(null);
    setOnlineStatus('lobby');
    setGamePhase('setup');
    setPlayerShips([]);
    setComputerShips([]);
    setPlayerShots([]);
    setComputerShots([]);
    setActiveShipType('carrier');
    setLogs([]);
    setRoomId('');
    setRoomInput('');
    setForfeitMessage(null);
    playSonarPing();
  };

  // Online Multiplayer Quick Play action launcher
  const handleFindQuickMatch = () => {
    if (socket) {
      socket.emit('join_matchmaking', { username });
    }
  };

  // Cancel queuing matchmaker search
  const handleCancelMatchmaker = () => {
    if (socket) {
      socket.emit('cancel_matchmaking');
    }
  };

  // Create customized private code room
  const handleCreatePrivateRoom = () => {
    if (socket) {
      socket.emit('create_room', { username });
    }
  };

  // Join friend's private code room
  const handleJoinPrivateRoom = (e: FormEvent) => {
    e.preventDefault();
    if (!roomInput.trim()) return;
    if (socket) {
      socket.emit('join_room', { roomId: roomInput, username });
    }
  };

  // Friendly share code helper copy utilities
  const handleCopyRoomCode = () => {
    navigator.clipboard.writeText(roomId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Metric evaluators for panels
  const totalPlayerFires = playerShots.length;
  const hitsCount = playerShots.filter(s => s.hit).length;
  const accuracyPercent = totalPlayerFires > 0 ? Math.round((hitsCount / totalPlayerFires) * 100) : 0;
  
  const currentOpponent = onlinePlayers.find(p => p.id !== socket?.id);
  const playerShipsLeft = playerShips.filter((s) => !s.sunk).length;

  // Since online computer board doesn't show secret coordinate until sunk, computerShips acts as synced coordinates
  const enemyShipsLeft = gameMode === 'online'
    ? onlinePlayers.find(p => p.id !== socket?.id)?.ships?.filter(s => !s.sunk).length ?? 5
    : computerShips.filter((s) => !s.sunk).length;

  const onlineWinsCount = playerShots.filter(s => s.hit && s.shipType).length;

  return (
    <div className={`min-h-screen bg-[#030908] text-[#d1faf4] font-sans p-4 md:p-8 relative overflow-x-hidden transition-colors duration-300 ${retroEffects ? 'crt-screen' : ''}`}>
      <div className="absolute inset-0 radar-grid opacity-[0.06] pointer-events-none z-0"></div>

      {/* Decorative fluorescent scanline sweep style */}
      {retroEffects && (
        <div className="absolute inset-0 pointer-events-none z-15 opacity-20 overflow-hidden">
          <div className="absolute w-full h-[3px] bg-teal-400 blur-[1px] top-0 animate-scan"></div>
          <div className="w-full h-full scanline"></div>
        </div>
      )}

      <main className="max-w-7xl mx-auto flex flex-col gap-6 relative z-10 select-none">
        
        {/* Core Tactical Navigation Top Header */}
        <header className="flex flex-col md:flex-row items-center justify-between gap-4 p-5 bg-slate-950/90 rounded-2xl border-2 border-teal-500/40 shadow-[0_0_30px_rgba(20,184,166,0.12)]">
          <div className="flex items-center gap-4">
            <button
              id="back-menu-btn"
              onClick={handleExitToWelcome}
              className={`p-2.5 rounded-xl border border-teal-500/20 bg-teal-950/20 hover:bg-teal-500/10 text-teal-400 transition-all cursor-pointer ${gameMode === null ? 'hidden' : 'flex'}`}
              title="Quay lại giao diện chính"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="p-2.5 bg-teal-500/10 rounded-xl border border-teal-500/30 text-glow-green animate-pulse">
              <Gamepad2 className="w-7 h-7 text-teal-400" />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-black tracking-widest uppercase text-teal-300 font-mono leading-none flex items-center gap-1.5">
                Hải Chiến <span className="text-glow-green text-teal-400">Classic</span>
              </h1>
              <p className="text-[10px] text-teal-500/60 font-mono tracking-widest uppercase mt-1">
                {gameMode === 'online' ? 'Tactical Multiplayer Online Node Active' : 'Offline AI simulation environment active'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Admiral Custom Nickname editor in lobby */}
            {gameMode === null && (
              <div className="flex items-center gap-2 bg-slate-900/60 border border-teal-500/20 rounded-lg py-1 px-3">
                <User className="w-3.5 h-3.5 text-teal-400" />
                <span className="text-xs text-teal-500/50 font-mono">Đô đốc:</span>
                <input
                  type="text"
                  maxLength={15}
                  value={username}
                  onChange={(e) => handleNameChange(e.target.value)}
                  className="bg-transparent text-teal-200 text-xs font-mono font-bold outline-none border-b border-transparent focus:border-teal-400 w-28 text-center"
                  placeholder="Nhập tên..."
                />
              </div>
            )}

            {/* AI Speed configuration */}
            {gameMode === 'offline' && gamePhase === 'playing' && (
              <div className="flex items-center gap-2 bg-slate-900/80 px-3 py-1.5 rounded-lg border border-teal-500/20 text-xs text-teal-400">
                <Sliders className="w-3.5 h-3.5 text-teal-400" />
                <span className="font-mono">Tốc độ AI:</span>
                <input
                  type="range"
                  min="200"
                  max="1800"
                  step="100"
                  value={aiShotDelay}
                  onChange={(e) => setAiShotDelay(Number(e.target.value))}
                  className="w-16 accent-teal-400 cursor-pointer"
                />
                <span className="font-mono text-[9px] w-12 text-right">{aiShotDelay}ms</span>
              </div>
            )}

            {/* Fog of War Developer Cheat */}
            {gameMode === 'offline' && gamePhase === 'playing' && (
              <button
                id="fow-cheat-toggle"
                onClick={() => setCheatMode(!cheatMode)}
                className={`p-2 rounded-lg border flex items-center justify-center gap-1.5 text-xs transition-all duration-300 font-bold active:scale-95 cursor-pointer
                  ${cheatMode ? 'bg-amber-500/20 border-amber-500 text-amber-300' : 'bg-slate-900/80 border-teal-500/20 text-teal-400 hover:border-teal-400'}`}
              >
                {cheatMode ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                <span className="hidden sm:inline font-mono">Quét Toàn Bản Đồ</span>
              </button>
            )}

            {/* Retro Effects / CRT Simulation Filter Toggle */}
            <button
              id="retro-theme-toggle"
              onClick={() => {
                setRetroEffects(!retroEffects);
                playSonarPing();
              }}
              className={`px-3 py-1.5 rounded-lg border text-xs font-mono font-bold transition-all cursor-pointer flex items-center gap-1.5 uppercase hover:scale-[1.02] active:scale-95
                ${retroEffects 
                  ? 'bg-amber-500/20 border-amber-500/50 text-amber-300 hover:bg-amber-500/30' 
                  : 'bg-teal-500/15 border-teal-500/30 text-teal-300 hover:bg-teal-500/25'}`}
              title="Chuyển đổi giao diện hiển thị: Vô tuyến CRT hoặc Radar chuẩn HD"
            >
              <Radio className={`w-3.5 h-3.5 ${retroEffects ? 'text-amber-400' : 'text-teal-450'}`} />
              <span>{retroEffects ? 'Vô tuyến CRT 📺' : 'Radar Siêu Nét 🎯'}</span>
            </button>

            {/* Audio configuration switches */}
            <button
              id="audio-mute-toggle"
              onClick={handleToggleMute}
              className="p-2 ml-1 rounded-lg bg-slate-900/80 hover:bg-slate-800 border border-teal-500/20 text-teal-300 hover:text-white transition-all cursor-pointer flex items-center justify-center"
            >
              {muted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4" />}
            </button>

            <button
              id="sonar-test-btn"
              onClick={handleSonarTest}
              className="p-2 text-xs font-semibold text-teal-400 border border-teal-500/10 rounded-lg hover:bg-teal-500/10 transition-colors uppercase font-mono"
            >
              Sonar Test
            </button>
          </div>
        </header>

        {/* --------------------- STAGE 1: SYSTEM GAME MODE SELECTIONS --------------------- */}
        {gameMode === null && (
          <div className="flex flex-col items-center justify-center min-h-[500px] py-10">
            <div className="w-full max-w-xl p-8 bg-slate-950/90 rounded-3xl border-2 border-teal-500/40 relative shadow-[0_0_40px_rgba(20,184,166,0.1)] text-center flex flex-col gap-8 transition-all">
              {retroEffects && <div className="absolute inset-0 pointer-events-none opacity-10 scanline"></div>}
              
              <div className="flex flex-col gap-2">
                <div className="w-16 h-16 bg-teal-500/10 rounded-full border border-teal-500/30 flex items-center justify-center text-teal-400 animate-pulse mx-auto mb-2">
                  <Swords className="w-8 h-8" />
                </div>
                <h2 className="text-2xl md:text-3xl font-extrabold tracking-widest text-teal-300 uppercase leading-none font-mono">
                  CHỌN TRẬN ĐỊA CHIẾN SỰ
                </h2>
                <p className="text-xs text-teal-500/50 uppercase tracking-widest font-mono">
                  Chọn hình thức chỉ huy lực lượng hải quân thủy quốc gia
                </p>
              </div>

              {/* Direct Welcome Panels */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* 1. Offline Mode Campaign launch */}
                <button
                  id="select-mode-offline"
                  onClick={() => {
                    setGameMode('offline');
                    playSonarPing();
                    addLog('Hệ thống rà soát vệ tinh dội bão. Hãy chuẩn bị xếp đặt quân cảng.', 'info');
                  }}
                  className="p-6 bg-gradient-to-b from-slate-900 to-slate-950 hover:to-teal-950/20 border-2 border-teal-500/20 hover:border-teal-400 text-left rounded-2xl group transition-all duration-300 cursor-pointer shadow-lg hover:scale-[1.01] active:scale-[0.99]"
                >
                  <div className="w-10 h-10 rounded-lg bg-teal-500/10 border border-teal-500/25 flex items-center justify-center text-teal-400 mb-4 group-hover:text-glow-green">
                    <User className="w-5 h-5" />
                  </div>
                  <h3 className="text-lg font-bold text-teal-200 group-hover:text-teal-300 font-mono">
                    CHƠI ĐƠN (VS AI)
                  </h3>
                  <p className="text-xs text-teal-500/60 mt-1 leading-relaxed">
                    Trận bão biển ác liệt nhất chiến dịch Thái Bình Dương với Máy tính sử dụng thuật toán pháo kích checkerboard cực kỳ khôn ngoan!
                  </p>
                </button>

                {/* 2. Online Mode Queue launch */}
                <button
                  id="select-mode-online"
                  onClick={() => {
                    setGameMode('online');
                    setOnlineStatus('lobby');
                    playSonarPing();
                  }}
                  className="p-6 bg-gradient-to-b from-slate-900 to-slate-950 hover:to-teal-950/20 border-2 border-teal-500/20 hover:border-teal-400 text-left rounded-2xl group transition-all duration-300 cursor-pointer shadow-lg hover:scale-[1.03] active:scale-[0.99] relative overflow-hidden"
                >
                  <div className="absolute top-2 right-2 px-2.5 py-0.5 border border-emerald-400/40 rounded-full text-[9px] font-mono text-emerald-400 uppercase tracking-widest bg-emerald-950/30 animate-pulse">
                    Hot Online
                  </div>

                  <div className="w-10 h-10 rounded-lg bg-teal-500/10 border border-teal-500/25 flex items-center justify-center text-teal-400 mb-4 group-hover:text-glow-green">
                    <Users className="w-5 h-5" />
                  </div>
                  <h3 className="text-lg font-bold text-teal-200 group-hover:text-teal-300 font-mono">
                    CHƠI MẠNG (ONLINE)
                  </h3>
                  <p className="text-xs text-teal-500/60 mt-1 leading-relaxed">
                    Ghép trận tự động xuyên hải lục hoặc tạo liên minh với bạn bè bằng mật phòng đặc vụ. Chuẩn luật Classic còi dồn!
                  </p>
                </button>
              </div>

              {/* Informative metadata banner footers */}
              <div className="p-4 rounded-xl bg-teal-950/15 border border-teal-500/10 flex items-center justify-between text-left text-xs text-teal-400/80 font-mono">
                <div className="flex gap-2 items-center">
                  <Radio className="w-4 h-4 text-emerald-400 animate-pulse" />
                  <span>Cảng hạm điện tử v4.0.0</span>
                </div>
                <div>Server ping: <strong className="text-emerald-400">12ms</strong></div>
              </div>

            </div>
          </div>
        )}

        {/* --------------------- STAGE 2: ONLINE MULTIPLAYER LOBBY SYSTEM --------------------- */}
        {gameMode === 'online' && onlineStatus === 'lobby' && (
          <div className="flex flex-col items-center justify-center min-h-[500px]">
            <div className="w-full max-w-lg p-8 bg-slate-950/90 rounded-3xl border-2 border-teal-500/40 relative shadow-[0_0_30px_rgba(20,184,166,0.08)]">
              {retroEffects && <div className="absolute inset-0 pointer-events-none opacity-10 scanline"></div>}

              <div className="flex flex-col items-center text-center gap-2 mb-6">
                <Users className="w-10 h-10 text-teal-400 animate-pulse mb-1" />
                <h2 className="text-xl font-bold uppercase tracking-widest text-teal-300 font-mono">
                  TRẠM ĐIỀU HÀNH THỦY QUÂN MULTIPLAYER
                </h2>
                <p className="text-xs text-teal-500/50 font-mono">
                  {username}, chọn hình thức điều hạm chiến tiếp cận hỏa lực:
                </p>
              </div>

              {/* Action grid options */}
              <div className="flex flex-col gap-4">
                
                {/* 1. Quick Matchmaker button queue */}
                <button
                  id="btn-find-quick-match"
                  onClick={handleFindQuickMatch}
                  className="w-full py-4.5 bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-400 hover:to-emerald-500 text-slate-950 font-bold uppercase text-sm tracking-widest rounded-xl transition-all shadow-[0_4px_15px_rgba(16,185,129,0.25)] hover:scale-[1.01] cursor-pointer flex items-center justify-center gap-2.5 text-glow-green"
                >
                  <Sparkles className="w-4.5 h-4.5" />
                  Gia Nhập Phòng Chờ Tốc Chiến (Matchmaking)
                </button>

                {/* Split dividers */}
                <div className="flex items-center text-center gap-3 py-1 font-mono text-xs text-teal-500/40 uppercase">
                  <div className="flex-1 h-[1px] bg-teal-500/10"></div>
                  <span>Hoặc tự xây dựng liên minh riêng</span>
                  <div className="flex-1 h-[1px] bg-teal-500/10"></div>
                </div>

                {/* 2. Create room options */}
                <button
                  id="btn-create-lobby-room"
                  onClick={handleCreatePrivateRoom}
                  className="w-full py-4 bg-slate-900 border border-teal-500/30 hover:border-teal-400 text-teal-300 font-bold uppercase text-xs tracking-widest rounded-xl transition-all hover:bg-slate-900/60 cursor-pointer"
                >
                  Tạo mật hiệu phòng chiến hữu riêng (Tạo Phòng)
                </button>

                {/* 3. Join by ID Room form options */}
                <form onSubmit={handleJoinPrivateRoom} className="mt-2.5">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      maxLength={8}
                      placeholder="NHẬP MÃ CODE PHÒNG CỦA BẠN BÈ..."
                      value={roomInput}
                      onChange={(e) => setRoomInput(e.target.value)}
                      className="flex-1 bg-slate-900/95 border border-teal-500/30 font-mono font-bold text-center text-sm rounded-xl py-3 text-teal-100 outline-none placeholder:text-teal-900/40 placeholder:font-sans uppercase tracking-widest focus:border-teal-400"
                    />
                    <button
                      id="btn-submit-join-room"
                      type="submit"
                      className="px-6 bg-teal-950/80 hover:bg-teal-500 text-teal-300 hover:text-slate-950 font-bold rounded-xl border border-teal-500/30 hover:border-teal-400 uppercase text-xs transition-colors cursor-pointer"
                    >
                      BẮN VÀO
                    </button>
                  </div>
                </form>

              </div>

              {/* Secondary return back controls */}
              <div className="mt-8 pt-5 border-t border-teal-500/10 text-center">
                <button
                  id="btn-exit-online-lobby"
                  onClick={handleExitToWelcome}
                  className="text-xs font-mono font-bold text-red-400 hover:text-red-300 uppercase transition-all duration-200 hover:tracking-wider flex items-center gap-1.5 mx-auto cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" /> Tháo hạm trạm chỉ huy
                </button>
              </div>

            </div>
          </div>
        )}

        {/* --------------------- STAGE 3: QUEUED IN MATCHMAKING MATCHMAKER SCREEN --------------------- */}
        {gameMode === 'online' && onlineStatus === 'matchmaking' && (
          <div className="flex flex-col items-center justify-center min-h-[500px]">
            <div className="w-full max-w-md p-8 bg-slate-950/90 rounded-3xl border-2 border-teal-500/40 relative shadow-[0_0_30px_rgba(245,158,11,0.08)] text-center flex flex-col gap-6">
              {retroEffects && <div className="absolute inset-0 pointer-events-none opacity-10 scanline"></div>}

              {/* Large spinning radar visual frame */}
              <div className="relative w-28 h-28 mx-auto flex items-center justify-center border-4 border-dashed border-teal-500/30 rounded-full">
                <span className="absolute w-24 h-24 bg-teal-500/5 rounded-full animate-ping opacity-60"></span>
                <Radio className="w-12 h-12 text-teal-400 animate-pulse" />
              </div>

              <div className="flex flex-col gap-1.5">
                <h3 className="text-lg font-bold text-teal-300 uppercase tracking-widest font-mono">
                  ĐANG QUÉT MẠNG TRẬN
                </h3>
                <p className="text-xs text-teal-500/50 font-mono animate-pulse">
                  Admiral, vệ tinh đang dội tín hiệu vô tuyến ngầm để tìm kiếm và sáp nhập hạm đối thủ...
                </p>
              </div>

              {/* Status information log */}
              <div className="p-3 bg-slate-900 rounded-xl border border-teal-500/10 text-xs font-mono text-center text-teal-400/80">
                Lớp học classic · Hạm đội mặc định (5 Tàu)
              </div>

              {/* Cancel search triggers */}
              <button
                id="btn-cancel-matchmaker"
                onClick={handleCancelMatchmaker}
                className="w-full py-3 border border-red-500/40 bg-red-950/20 hover:bg-red-500/20 text-red-400 font-bold uppercase text-xs tracking-wider rounded-xl transition-all cursor-pointer active:scale-95"
              >
                HỦY TÌM KIẾM
              </button>
            </div>
          </div>
        )}

        {/* --------------------- STAGE 4: PRIVATE CODE CREATED/ROOM LOBBY --------------------- */}
        {gameMode === 'online' && onlineStatus === 'room' && (
          <div className="flex flex-col items-center justify-center min-h-[500px]">
            <div className="w-full max-w-lg p-8 bg-slate-950/90 rounded-3xl border-2 border-teal-500/40 relative shadow-[0_0_30px_rgba(20,184,166,0.08)]">
              {retroEffects && <div className="absolute inset-0 pointer-events-none opacity-10 scanline"></div>}

              <div className="flex flex-col items-center text-center gap-1.5 mb-6">
                <Shield className="w-10 h-10 text-teal-400 animate-pulse mb-1" />
                <h3 className="text-lg font-extrabold uppercase tracking-widest text-teal-300 font-mono">
                  PHÒNG CHIÊN MINH RIÊNG
                </h3>
                <p className="text-xs text-teal-500/50 font-mono">
                  Chia sẻ Mã số Code mật bên dưới để bạn bè nhảy phòng giáp trận:
                </p>
              </div>

              {/* Code visualizer display card */}
              <div className="flex items-center gap-3 bg-slate-900 p-4.5 rounded-2xl border border-teal-500/30 justify-between mb-5 select-text">
                <div className="flex flex-col">
                  <span className="text-[10px] text-teal-500/50 font-mono uppercase tracking-widest">Room Secret Code</span>
                  <span className="text-2xl font-black font-mono tracking-widest text-[#00ff99] text-glow-green uppercase">{roomId}</span>
                </div>
                <button
                  id="btn-copy-code"
                  onClick={handleCopyRoomCode}
                  className="py-2.5 px-4.5 bg-teal-500 text-slate-950 font-black tracking-wider uppercase text-xs rounded-xl flex items-center gap-2 cursor-pointer transition-transform duration-200 active:scale-95 hover:bg-teal-400"
                >
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  {copied ? 'Đã Sao Chép!' : 'SAO CHÉP MÃ'}
                </button>
              </div>

              {/* Connect status tracker */}
              <div className="flex flex-col gap-3 font-mono">
                <span className="text-[10px] text-teal-500/50 uppercase tracking-widest">Thành hạm đã có mặt:</span>
                
                {onlinePlayers.map((p, idx) => (
                  <div key={p.id} className="flex items-center gap-3 p-3 bg-slate-900/60 rounded-xl border border-teal-500/10">
                    <div className="w-6 h-6 rounded-full bg-teal-500/10 border border-teal-500/20 text-teal-400 flex items-center justify-center text-xs font-bold font-mono">
                      {idx + 1}
                    </div>
                    <span className="text-sm font-bold text-teal-100 flex-1">{p.username}</span>
                    <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-widest bg-emerald-950/20 py-1 px-2.5 rounded-md">
                      CONNECTED
                    </span>
                  </div>
                ))}

                {onlinePlayers.length < 2 && (
                  <div className="flex items-center gap-3 p-3 border border-dashed border-teal-500/20 animate-pulse rounded-xl text-xs text-teal-500/40 text-center justify-center">
                    Gió biển đìu hiu... Đang đợi đầu dây bên kia kết nối hệ thống...
                  </div>
                )}
              </div>

              <div className="mt-9 text-center border-t border-teal-500/15 pt-5">
                <button
                  id="btn-leave-priv-room"
                  onClick={handleExitToWelcome}
                  className="text-xs font-mono font-bold text-red-400 hover:text-red-300 uppercase cursor-pointer"
                >
                  Rã phòng rút lui
                </button>
              </div>

            </div>
          </div>
        )}

        {/* --------------------- STAGE 5: GAME SETUP PHASE (AI & Multiplayer unified) --------------------- */}
        {gamePhase === 'setup' && gameMode && (onlineStatus === 'setup' || onlineStatus === 'ready_wait') && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            
            {/* Direct configurations selector columns */}
            <div className="lg:col-span-4 flex flex-col gap-6">
              
              {/* Tactical instructions manual box */}
              <div className="p-5 bg-slate-950/80 rounded-2xl border-2 border-teal-500/30 flex flex-col gap-4 shadow-[0_0_20px_rgba(20,184,166,0.03)]">
                <h3 className="text-md font-extrabold uppercase tracking-widest text-teal-300 flex items-center gap-2">
                  <Shield className="w-5 h-5 text-teal-400" />
                  MỆNH LỆNH SẮP TÀU
                </h3>
                <ol className="text-xs space-y-3.5 text-teal-200/80 leading-relaxed list-decimal pl-4.5 font-mono">
                  <li>Nhấp chọn hạm đội bến mạn phải để xếp.</li>
                  <li>Xoay hướng đứng / ngang bằng phím <strong>[Spacebar]</strong> hoặc <strong>[R]</strong>.</li>
                  <li>Click vào ô trên bản đồ đại dương của bạn để đặt tàu.</li>
                  <li>Sử dụng phím nhanh <strong>Random xếp</strong> để sáp nhanh bố cục.</li>
                  <li>Click <strong>SẴN SÀNG</strong> để vào ván chiến đấu mạng!</li>
                </ol>
              </div>

              {/* Selector widget components */}
              <ShipSelector
                ships={playerShips}
                activeShipType={activeShipType}
                activeVertical={activeVertical}
                onSelectShip={(type) => setActiveShipType(type)}
                onToggleOrientation={handleToggleOrientation}
                onAutoPlace={handleAutoPlacePlayer}
                onClearBoard={handleClearPlayerBoard}
              />
            </div>

            {/* Ocean Deployment board visualization canvas - Right */}
            <div className="lg:col-span-8 flex flex-col items-center justify-center p-6 md:p-8 bg-slate-950/90 rounded-3xl border-2 border-teal-500/30 shadow-[0_8px_30px_rgba(20,184,166,0.04)] min-h-[500px]">
              
              <div className="text-center mb-5 flex flex-col items-center">
                <span className="px-3.5 py-1 text-xs font-mono font-bold uppercase border border-teal-400/40 text-teal-300 rounded-full tracking-widest bg-teal-950/20">
                  Bản Đồ Hạm Đội Thủy Bộ Admiral
                </span>

                {/* Opponent Status tracker during deploy inside setup */}
                {gameMode === 'online' && (
                  <div className="mt-3 flex items-center gap-3 text-xs bg-slate-900 border border-teal-500/20 py-1.5 px-3 rounded-lg font-mono text-teal-400">
                    <span>Đối thủ: <strong>{currentOpponent?.username}</strong></span>
                    <span className="text-teal-500/40">|</span>
                    {currentOpponent?.ready ? (
                      <span className="text-emerald-400 font-bold uppercase flex items-center gap-1">
                        <Check className="w-4 h-4" /> ĐÃ SẴN SÀNG!
                      </span>
                    ) : (
                      <span className="text-amber-500/80 animate-pulse uppercase">
                        Đang dàn trận...
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Deploy radar viewport */}
              <BoardGrid
                owner="player"
                ships={playerShips}
                shots={[]}
                phase={gamePhase}
                activeShipType={activeShipType}
                activeVertical={activeVertical}
                hoverCoordinate={hoverCoordinate}
                onCellClick={placePlayerShip}
                onCellMouseEnter={handleCellMouseEnter}
                onCellMouseLeave={handleCellMouseLeave}
                showUnSunkShips={true}
                retro={retroEffects}
              />

              {/* Start/Ready triggers */}
              <div className="mt-8 flex justify-center w-full max-w-[320px]">
                {gameMode === 'online' ? (
                  <button
                    id="online-ready-cta"
                    onClick={handleReadyOnline}
                    disabled={playerShips.length < 5 || onlineStatus === 'ready_wait'}
                    className={`
                      w-full py-4.5 rounded-xl font-bold tracking-widest uppercase transition-all duration-300 flex items-center justify-center gap-3 text-glow-green cursor-pointer
                      ${playerShips.length === 5 && onlineStatus !== 'ready_wait'
                        ? 'bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-400 hover:to-emerald-500 text-slate-950 shadow-[0_8px_25px_rgba(16,185,129,0.3)] hover:scale-[1.03] active:scale-[0.98]'
                        : 'bg-slate-900/50 border border-slate-800 text-teal-900/40 cursor-not-allowed text-xs'
                      }
                    `}
                  >
                    <Check className="w-5 h-5" />
                    {onlineStatus === 'ready_wait' ? 'ĐANG TÌM ĐẦU DÂY...' : 'TÔI ĐÃ SẴN SÀNG ✅'}
                  </button>
                ) : (
                  <button
                    id="start-battle-cta"
                    onClick={handleStartGameOffline}
                    disabled={playerShips.length < 5}
                    className={`
                      w-full py-4.5 rounded-xl font-bold tracking-widest uppercase transition-all duration-300 flex items-center justify-center gap-3 text-glow-green cursor-pointer
                      ${playerShips.length === 5
                        ? 'bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-400 hover:to-emerald-500 text-slate-950 shadow-[0_8px_25px_rgba(16,185,129,0.3)] hover:scale-[1.03] active:scale-[0.98]'
                        : 'bg-slate-900/50 border border-slate-800 text-teal-900/40 cursor-not-allowed text-xs'
                      }
                    `}
                  >
                    <Play className="w-5 h-5 fill-current" />
                    Báo động nổ súng!
                  </button>
                )}
              </div>

            </div>
          </div>
        )}

        {/* --------------------- STAGE 6: ACTIVE COMBAT PLAYING FLOW (AI & Online unified) --------------------- */}
        {gamePhase === 'playing' && gameMode && (() => {
          const isMyTurn = (gameMode === 'offline' && turn === 'player') || (gameMode === 'online' && turn === socket?.id);
          return (
            <div className="w-full flex flex-col gap-6">
              
              {/* HIGH-TECH COMMANDER TURN INDICATOR BAR */}
              <div 
                className={`w-full p-4 sm:p-5 rounded-3xl border-2 transition-all duration-300 flex flex-col md:flex-row items-center justify-between gap-4 shadow-lg overflow-hidden relative
                  ${isMyTurn 
                    ? 'bg-slate-950/95 border-teal-500/40 shadow-[0_0_25px_rgba(20,184,166,0.12)] text-teal-300' 
                    : 'bg-slate-950/95 border-red-500/40 shadow-[0_0_25px_rgba(239,68,68,0.12)] text-red-400'}`}
              >
                {/* Visual scanning grid pulse background */}
                <div className={`absolute inset-0 opacity-5 pointer-events-none ${isMyTurn ? 'bg-teal-500 animate-pulse' : 'bg-red-500 animate-pulse-glow'}`}></div>

                {/* Left Side: Connection / Game Mode status */}
                <div className="flex items-center gap-3 w-full md:w-auto">
                  <div className={`flex items-center justify-center w-11 h-11 rounded-2xl border-2 transition-all duration-300
                    ${isMyTurn 
                      ? 'border-teal-400 bg-teal-950/80 text-teal-300 animate-pulse shadow-[0_0_12px_rgba(20,184,166,0.3)]' 
                      : 'border-red-500/50 bg-red-950/80 text-red-400 font-bold'}`}>
                    {isMyTurn ? (
                      <span className="text-xl">⚡</span>
                    ) : (
                      <span className="text-xl">⚠️</span>
                    )}
                  </div>
                  <div className="font-mono">
                    <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest block">CHẾ ĐỘ CHỈ HUY</span>
                    <span className="text-xs sm:text-sm font-black uppercase tracking-wide">
                      {gameMode === 'online' ? `Trực tuyến: ${roomId}` : 'Chiến đấu với Máy (AI)'}
                    </span>
                  </div>
                </div>

                {/* Center Block: Huge explicit statement of whose turn */}
                <div className="flex-1 text-center py-2 px-4 border-y md:border-y-0 md:border-x border-teal-500/10 min-w-[200px] sm:min-w-[280px]">
                  {isMyTurn ? (
                    <div className="flex flex-col items-center justify-center gap-1">
                      <span className="text-sm sm:text-base md:text-lg font-black tracking-widest uppercase text-teal-400 text-glow-green animate-pulse">
                        🎯 LƯỢT KHAI HỎA CỦA BẠN!
                      </span>
                      <span className="text-[10px] text-teal-400/80 font-medium">
                        Chọn tọa độ thích hợp trên RADAR ĐỊCH (Bên Phải) để dội pháo!
                      </span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center gap-1">
                      <span className="text-sm sm:text-base md:text-lg font-black tracking-widest uppercase text-red-500 text-glow-red animate-pulse">
                        ⚠️ ĐỊCH ĐANG CHỌN TỌA ĐỘ BẮN!
                      </span>
                      <span className="text-[10px] text-red-400/80 font-medium">
                        Vui lòng chờ đợi trong khi hạm đội địch đang tiến hành không kích...
                      </span>
                    </div>
                  )}
                </div>

                {/* Right Block: Ship live summary */}
                <div className="flex items-center gap-4 font-mono text-center w-full md:w-auto justify-around sm:justify-end">
                  <div>
                    <span className="block text-[9px] text-slate-500 font-black uppercase">TẦU TA SỐNG</span>
                    <span className="text-xs sm:text-sm font-black text-teal-300">
                      {playerShipsLeft} <span className="text-slate-600">/ 5</span>
                    </span>
                  </div>
                  <div className="w-px h-8 bg-teal-500/10 hidden sm:block"></div>
                  <div>
                    <span className="block text-[9px] text-slate-500 font-black uppercase">TẦU ĐỊCH SỐNG</span>
                    <span className="text-xs sm:text-sm font-black text-rose-400">
                      {enemyShipsLeft} <span className="text-slate-600">/ 5</span>
                    </span>
                  </div>
                </div>
              </div>

              {/* THREE SIDES PLAY FLOW */}
              <div className="flex flex-col lg:grid lg:grid-cols-12 gap-6 xl:gap-8 items-stretch">
                
                {/* 1. PLAN / DEFENSIVE FLEET GRID - OWN SHIPS */}
                <div className={`order-3 lg:order-1 lg:col-span-5 flex flex-col items-center justify-center p-5 md:p-7 bg-slate-950/90 rounded-3xl border-2 transition-all duration-300
                  ${!isMyTurn 
                    ? 'border-red-500/40 shadow-[0_0_30px_rgba(239,68,68,0.06)]' 
                    : 'border-teal-500/20 shadow-[0_8px_30px_rgba(20,184,166,0.02)]'}`}>
                  
                  <div className="w-full flex items-center justify-between mb-4 border-b border-teal-500/10 pb-3 font-mono">
                    <div className="flex items-center gap-1.5">
                      {!isMyTurn ? (
                        <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-500 animate-ping"></span>
                      ) : (
                        <span className="inline-block w-2.5 h-2.5 rounded-full bg-teal-400/60"></span>
                      )}
                      <span className={`text-xs md:text-sm font-bold uppercase tracking-widest ${!isMyTurn ? 'text-red-400' : 'text-teal-300'}`}>
                        🛡️ THÀNH HẠM ĐỘI QUÂN TA
                      </span>
                    </div>
                    
                    {!isMyTurn ? (
                      <span className="text-[10px] md:text-xs text-red-400 bg-red-950/30 border border-red-500/20 py-1 px-2.5 rounded-md animate-pulse uppercase font-bold">
                        ⚠️ ĐỊCH ĐANG NHẮM BẮN
                      </span>
                    ) : (
                      <span className="text-[10px] md:text-xs text-teal-400 bg-teal-950/40 border border-teal-500/20 py-1 px-2.5 rounded-md font-bold">
                        🟢 TRẠNG THÁI: AN TOÀN
                      </span>
                    )}
                  </div>

                  {/* Fire overlay warning representation */}
                  <div className="relative mb-5 flex flex-col items-center">
                    {!isMyTurn && (
                      <div className="absolute inset-0 bg-red-500/5 border border-red-500/10 blur-[2px] rounded-lg animate-pulse z-20 pointer-events-none"></div>
                    )}
                    
                    <BoardGrid
                      owner="player"
                      ships={playerShips}
                      shots={computerShots}
                      phase={gamePhase}
                      activeShipType={null}
                      activeVertical={false}
                      hoverCoordinate={null}
                      onCellClick={() => {}}
                      showUnSunkShips={true}
                      retro={retroEffects}
                      disabled={isMyTurn} // Disable clicks/hovers on player grid
                    />
                  </div>

                  {/* Own Fleet integrity status trackers */}
                  <div className="w-full flex flex-col gap-2 mt-2 font-mono">
                    <span className="text-[10px] text-teal-500/50 uppercase tracking-widest mb-1">
                      Chỉ số sức bền hạm đội của ta:
                    </span>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                      {SHIPS.map((ship) => {
                        const inst = playerShips.find((s) => s.type === ship.type);
                        const isSunk = inst ? inst.sunk : false;
                        const hitCount = inst ? inst.hits.filter(h => h).length : 0;
                        return (
                          <div 
                            key={`health-allied-${ship.type}`}
                            className={`p-2 rounded-lg border text-center text-[10px] transition-all
                              ${isSunk 
                                ? 'bg-red-950/20 border-red-500/30 text-red-400 opacity-60 line-through' 
                                : hitCount > 0
                                  ? 'bg-amber-950/20 border-amber-500/30 text-amber-300'
                                  : 'bg-slate-900 border-teal-500/10 text-teal-400'
                              }
                            `}
                          >
                            <div className="font-bold truncate">{ship.name.split(' ').pop()}</div>
                            <div className="text-[9px] opacity-70 mt-0.5">Vỏ: {ship.size - hitCount}/{ship.size}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* 2. CENTRAL PANEL - SCOREBOARD & DETAILS */}
                <div className="order-1 lg:order-2 lg:col-span-2 flex flex-col gap-4 self-stretch justify-between">
                  
                  {/* Turn Indicator notifier */}
                  <div className={`p-4 rounded-2xl bg-slate-950/95 border-2 flex flex-col items-center justify-center text-center gap-2 shadow-lg h-32 select-none transition-all duration-300
                    ${isMyTurn ? 'border-teal-500/50 shadow-[0_0_15px_rgba(20,184,166,0.12)]' : 'border-red-500/40 shadow-[0_0_15px_rgba(239,68,68,0.12)]'}`}>
                    <span className="text-[9px] font-mono uppercase tracking-widest text-slate-500 block">
                      QUYỀN KIỂM SOÁT
                    </span>
                    
                    {isMyTurn ? (
                      <div className="animate-pulse">
                        <span className="text-xs sm:text-sm font-black uppercase tracking-widest text-[#00ff99] text-glow-green font-mono block">
                          TA KHAI HỎA
                        </span>
                        <span className="text-[9px] text-teal-400/80 font-mono mt-1 block leading-tight">
                          Radar địch đang mở!
                        </span>
                      </div>
                    ) : (
                      <div className="animate-pulse flex flex-col items-center">
                        <span className="text-xs sm:text-sm font-black uppercase tracking-widest text-red-500 text-glow-red font-mono block">
                          ĐỊCH TẤN CÔNG
                        </span>
                        <span className="w-16 h-1 mt-2 bg-red-500 rounded-full animate-pulse"></span>
                      </div>
                    )}
                  </div>

                  {/* Real-time battle performance tracking widgets */}
                  <div className="p-4 bg-slate-950/80 rounded-2xl border border-teal-500/20 text-xs font-mono text-center flex flex-col gap-2.5 self-center w-full justify-center h-28">
                    <div className="font-bold uppercase tracking-wider text-teal-400 mb-0.5">Bản tin chiến quả</div>
                    <div className="grid grid-cols-2 gap-1 text-[11px] text-[#00ff99]">
                      <div className="border-r border-teal-500/20 pr-2">
                        <div>Tổng Loạt Phóng</div>
                        <div className="font-bold text-sm text-white mt-0.5">{totalPlayerFires}</div>
                      </div>
                      <div className="pl-2">
                        <div>Thiệt hại địch</div>
                        <div className="font-bold text-sm text-rose-400 mt-0.5">
                          {gameMode === 'online' ? onlineWinsCount : computerShips.filter(s => s.sunk).length}/5
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="hidden lg:flex p-3 rounded-xl bg-slate-950/40 border border-teal-500/10 text-[9px] font-mono text-teal-500/40 leading-relaxed text-center justify-center items-center">
                    Hệ thống vô tuyến sóng ngắn sonar liên tục quét tọa độ chiến trận!
                  </div>

                </div>

                {/* 3. ATTACK RADAR (RIGHT BOARD) - OPPONENT GRID */}
                <div className={`order-2 lg:order-3 lg:col-span-5 flex flex-col items-center justify-center p-5 md:p-7 bg-slate-950/90 rounded-3xl border-2 transition-all duration-300
                  ${isMyTurn 
                    ? 'border-teal-500/50 shadow-[0_0_35px_rgba(20,184,166,0.15)] ring-1 ring-teal-500/30' 
                    : 'border-slate-800 bg-slate-950/45 shadow-[0_8px_30px_rgba(0,0,0,0.4)] opacity-75'}`}>
                  
                  <div className="w-full flex items-center justify-between mb-4 border-b border-teal-500/10 pb-3 font-mono">
                    <div className="flex items-center gap-1.5">
                      {isMyTurn ? (
                        <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping"></span>
                      ) : (
                        <span className="inline-block w-2.5 h-2.5 rounded-full bg-slate-600"></span>
                      )}
                      <span className={`text-xs md:text-sm font-bold uppercase tracking-widest ${isMyTurn ? 'text-teal-300' : 'text-slate-400'}`}>
                        🔴 RADAR DÒ THUYỀN kẻ thù
                      </span>
                    </div>

                    {isMyTurn ? (
                      <span className="text-[10px] md:text-xs text-emerald-400 bg-emerald-950/50 border border-emerald-500/30 py-1 px-2.5 rounded-md uppercase font-bold animate-pulse">
                        🔥 KHAI HỎA SẴN SÀNG
                      </span>
                    ) : (
                      <span className="text-[10px] md:text-xs text-slate-500 bg-slate-900 border border-slate-800 py-1 px-2.5 rounded-md font-bold uppercase">
                        🔒 ĐANG ĐÓNG RADAR
                      </span>
                    )}
                  </div>

                  <div className="relative mb-5 flex flex-col items-center">
                    {isMyTurn && (
                      <div className="absolute inset-0 bg-teal-400/5 border border-teal-500/20 blur-[1.5px] rounded-lg animate-pulse z-20 pointer-events-none"></div>
                    )}

                    <BoardGrid
                      owner="computer"
                      ships={gameMode === 'online' ? (currentOpponent?.ships || []) : computerShips}
                      shots={playerShots}
                      phase={gamePhase}
                      activeShipType={null}
                      activeVertical={false}
                      hoverCoordinate={null}
                      onCellClick={handleCellClickFire}
                      showUnSunkShips={gameMode === 'online' ? cheatMode : cheatMode} // Allow looking if scanning active
                      retro={retroEffects}
                      disabled={!isMyTurn} // Disable targeting on enemy board when it is opponent's turn!!
                    />
                  </div>

                  {/* Competitor damage health panel */}
                  <div className="w-full flex flex-col gap-2 mt-2 font-mono">
                    <span className="text-[10px] text-teal-500/50 uppercase tracking-widest mb-1">
                      Trạng thái phá hoại hạm đội địch:
                    </span>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                      {SHIPS.map((ship) => {
                        const inst = gameMode === 'online'
                          ? currentOpponent?.ships?.find(s => s.type === ship.type)
                          : computerShips.find((s) => s.type === ship.type);
                        const isSunk = inst ? inst.sunk : false;
                        const isHit = inst ? inst.hits.some(h => h) : false;
                        return (
                          <div 
                            key={`health-enemy-${ship.type}`}
                            className={`p-2 rounded-lg border text-center text-[10px] transition-all
                              ${isSunk 
                                ? 'bg-rose-950/40 border-red-500/40 text-red-400 line-through font-bold' 
                                : isHit
                                  ? 'bg-amber-950/20 border-amber-500/20 text-amber-400'
                                  : 'bg-slate-900 border-teal-500/10 text-teal-500/40'
                              }
                            `}
                          >
                            <div className="truncate">{ship.name.split(' ').pop()}</div>
                            <div className="text-[9px] opacity-70 mt-0.5">
                              {isSunk ? 'SUNK' : isHit ? 'DAMAGED' : 'HIDDEN'}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

              </div>
            </div>
          );
        })()}

        {/* --------------------- BOTTOM BAR: CENTRALIZED COMMAND CENTER FEED LOGS --------------------- */}
        {(gamePhase === 'playing' || logs.length > 0) && (
          <CommandCenter logs={logs} accuracy={accuracyPercent} score={hitsCount * 125} />
        )}

        {/* --------------------- COMPREHENSIVE OVERLAY: GAME OVER (Victory / Defeat) --------------------- */}
        {(gamePhase === 'victory' || gamePhase === 'defeat') && (onlineStatus === 'gameover' || gameMode === 'offline') && (
          <div className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-fade-in font-mono select-text">
            <div 
              className={`
                w-full max-w-lg p-8 rounded-3xl border-2 text-center relative overflow-hidden flex flex-col items-center gap-6
                ${gamePhase === 'victory' 
                  ? 'border-emerald-500/40 bg-gradient-to-b from-slate-950 to-emerald-990 shadow-[0_0_50px_rgba(16,185,129,0.2)]'
                  : 'border-red-500/40 bg-gradient-to-b from-slate-950 to-red-995 shadow-[0_0_50px_rgba(239, 68, 68, 0.2)]'
                }
              `}
            >
              {retroEffects && <div className="absolute inset-0 pointer-events-none opacity-20 scanline"></div>}

              {gamePhase === 'victory' ? (
                <div className="w-16 h-16 bg-emerald-500/10 rounded-full border-2 border-emerald-400 flex items-center justify-center text-emerald-400 animate-bounce">
                  <Trophy className="w-8 h-8" />
                </div>
              ) : (
                <div className="w-16 h-16 bg-red-500/10 rounded-full border-2 border-red-500 flex items-center justify-center text-red-500 animate-pulse">
                  <AlertTriangle className="w-8 h-8" />
                </div>
              )}

              <div>
                <h2 className={`text-2xl md:text-3xl font-black uppercase tracking-widest ${gamePhase === 'victory' ? 'text-emerald-400 text-glow-green' : 'text-red-500 text-glow-red'}`}>
                  {gamePhase === 'victory' ? 'CHIẾN THẮNG QUANG VINH!' : 'BẠN ĐÃ BỊ THẤT TRẬN!'}
                </h2>
                <p className="text-xs text-teal-400/60 uppercase tracking-widest mt-1">
                  Đại bản doanh tổng thống soái hải lực
                </p>
              </div>

              {/* Stats recap table */}
              <div className="w-full grid grid-cols-3 gap-3 bg-slate-900/60 p-4 rounded-xl border border-teal-400/20 text-xs">
                <div>
                  <div className="text-teal-500/50 uppercase tracking-wider text-[9px]">Tỷ lệ chuẩn hỏa</div>
                  <div className={`font-bold text-base mt-0.5 ${gamePhase === 'victory' ? 'text-emerald-400' : 'text-teal-300'}`}>{accuracyPercent}%</div>
                </div>
                <div className="border-x border-teal-500/20 px-2">
                  <div className="text-teal-500/50 uppercase tracking-wider text-[9px]">Tổng pháo nổ</div>
                  <div className="font-bold text-base mt-0.5 text-white">{totalPlayerFires} phát</div>
                </div>
                <div>
                  <div className="text-teal-500/50 uppercase tracking-wider text-[9px]">Điểm hạm đội</div>
                  <div className="font-bold text-base mt-0.5 text-teal-300">{hitsCount * 125}</div>
                </div>
              </div>

              <p className="text-xs text-teal-200/80 max-w-sm px-4 leading-relaxed">
                {forfeitMessage 
                  ? forfeitMessage
                  : gamePhase === 'victory' 
                    ? 'Bằng khả năng sáp trận và tài thao lược tuyệt đỉnh, Đô Đốc đã nhấn chìm thế trận vây địch, ca bài khải hoàn vang dội phao quân!'
                    : 'Hạm thuyền của ta không may đã phải gánh dội bão ác kích từ địch. Hãy khôi phục lại radar và sáp trận hãm hạm tiếp tục!'}
              </p>

              {/* Actions */}
              <div className="flex gap-3 mt-2 w-full">
                {gameMode === 'offline' ? (
                  <button
                    id="replay-offline-btn"
                    onClick={handleRestartOffline}
                    className={`flex-1 py-3 px-6 rounded-xl font-bold uppercase tracking-widest text-slate-950 transition-all cursor-pointer active:scale-95 shadow-md flex items-center gap-1.5 justify-center text-xs
                      ${gamePhase === 'victory' ? 'bg-emerald-400 hover:bg-emerald-300' : 'bg-red-500 hover:bg-red-400'}`}
                  >
                    <RefreshCw className="w-4 h-4" /> Làm ván AI mới
                  </button>
                ) : null}

                <button
                  id="final-quit-lobby"
                  onClick={handleExitToWelcome}
                  className="flex-1 py-3 px-6 rounded-xl bg-slate-900 border border-teal-500/30 hover:border-teal-400 font-bold uppercase text-xs tracking-wider text-teal-300 cursor-pointer active:scale-95 hover:bg-slate-800"
                >
                  Về Bản Doanh
                </button>
              </div>

            </div>
          </div>
        )}

      </main>

      <footer className="max-w-7xl mx-auto mt-10 p-5 border-t border-teal-500/10 flex flex-col sm:flex-row justify-between items-center text-[9px] text-teal-500/30 select-none font-mono tracking-wider gap-2">
        <span>© 2026 BẮN THUYỀN ONLINE MILITARY NETWORK CO. ALL PERMISSION RESERVED.</span>
        <span>LATENCY TRUYỀN: 12MS · CHANNELS: DECRYPT FM-108.5 SECURED</span>
      </footer>
    </div>
  );
}
