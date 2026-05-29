import express from 'express';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import path from 'path';
import { createServer as createViteServer } from 'vite';

// Types used directly in severe synchronization (redefined to keep server standalone)
type ShipType = 'carrier' | 'battleship' | 'destroyer' | 'submarine' | 'patrol';

interface ShipInstance {
  type: ShipType;
  r: number;
  c: number;
  vertical: boolean;
  hits: boolean[];
  sunk: boolean;
}

interface Coordinate {
  r: number;
  c: number;
}

interface Shot {
  r: number;
  c: number;
  hit: boolean;
  shipType?: ShipType;
}

interface Player {
  id: string; // Socket ID
  username: string;
  ships: ShipInstance[];
  ready: boolean;
  shots: Shot[];
}

interface Room {
  id: string;
  status: 'setup' | 'playing' | 'gameover';
  players: Player[];
  turn: string | null; // Socket ID
  winner: string | null; // Socket ID
}

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = 3000;

// Memory storage for Rooms and Matchmaking Queue
const rooms = new Map<string, Room>();
let matchmakingQueue: { socketId: string; username: string }[] = [];

// Helper functions for battleship validation
function getShipSize(type: ShipType): number {
  switch (type) {
    case 'carrier': return 5;
    case 'battleship': return 4;
    case 'destroyer': return 3;
    case 'submarine': return 3;
    case 'patrol': return 2;
  }
}

function getShipCoordinates(r: number, c: number, size: number, vertical: boolean): Coordinate[] {
  const coords: Coordinate[] = [];
  for (let i = 0; i < size; i++) {
    coords.push({
      r: vertical ? r + i : r,
      c: vertical ? c : c + i
    });
  }
  return coords;
}

function getShipAtCoordinate(r: number, c: number, ships: ShipInstance[]) {
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

// REST api route example
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    roomsCount: rooms.size,
    matchmakingCount: matchmakingQueue.length 
  });
});

// Socket.IO Tactical game engine
io.on('connection', (socket: Socket) => {
  console.log(`[NET] Player connected: ${socket.id}`);

  // Handle Matchmaking
  socket.on('join_matchmaking', ({ username }: { username: string }) => {
    // Basic sanitize
    const name = username?.trim() || `Tân Binh #${socket.id.substring(0, 4)}`;
    
    // Check if player is already in matchmaking queue
    matchmakingQueue = matchmakingQueue.filter(p => p.socketId !== socket.id);
    
    // If there is someone else waiting, pair them up immediately
    if (matchmakingQueue.length > 0) {
      const opponent = matchmakingQueue.shift()!;
      const roomId = `room-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

      const newRoom: Room = {
        id: roomId,
        status: 'setup',
        winner: null,
        turn: null,
        players: [
          { id: socket.id, username: name, ships: [], ready: false, shots: [] },
          { id: opponent.socketId, username: opponent.username, ships: [], ready: false, shots: [] }
        ]
      };

      rooms.set(roomId, newRoom);

      // Join standard rooms
      socket.join(roomId);
      const oppSocket = io.sockets.sockets.get(opponent.socketId);
      if (oppSocket) {
        oppSocket.join(roomId);
      }

      // Notify both players
      io.to(roomId).emit('match_found', {
        roomId,
        players: newRoom.players.map(p => ({ id: p.id, username: p.username }))
      });

      console.log(`[NET] Match successfully found: Room ${roomId}. ${name} vs ${opponent.username}`);
    } else {
      // Add to queue
      matchmakingQueue.push({ socketId: socket.id, username: name });
      socket.emit('matchmaking_queued', { isQueued: true });
      console.log(`[NET] ${name} queued in Matchmaker`);
    }
  });

  // Create custom room with code
  socket.on('create_room', ({ username }: { username: string }) => {
    const name = username?.trim() || `Đô đốc #${socket.id.substring(0, 4)}`;
    const roomCode = Math.random().toString(36).substring(2, 7).toUpperCase(); // 5 digit uppercase code

    const newRoom: Room = {
      id: roomCode,
      status: 'setup',
      winner: null,
      turn: null,
      players: [
        { id: socket.id, username: name, ships: [], ready: false, shots: [] }
      ]
    };

    rooms.set(roomCode, newRoom);
    socket.join(roomCode);

    socket.emit('room_created', {
      roomId: roomCode,
      players: newRoom.players.map(p => ({ id: p.id, username: p.username }))
    });
    console.log(`[NET] ${name} created Room Code: ${roomCode}`);
  });

  // Join custom room by Code
  socket.on('join_room', ({ roomId, username }: { roomId: string; username: string }) => {
    const code = roomId?.trim().toUpperCase();
    const name = username?.trim() || `Đô đốc #${socket.id.substring(0, 4)}`;
    const room = rooms.get(code);

    if (!room) {
      socket.emit('join_error', { message: 'Không tìm thấy phòng chiến sự với mã số này!' });
      return;
    }

    if (room.players.length >= 2) {
      socket.emit('join_error', { message: 'Phòng chiến sự này đã đủ 2 hạm đội quân!' });
      return;
    }

    // Add to existing room
    room.players.push({
      id: socket.id,
      username: name,
      ships: [],
      ready: false,
      shots: []
    });

    socket.join(code);

    // Notify all players in room
    io.to(code).emit('lobby_update', {
      roomId: code,
      players: room.players.map(p => ({ id: p.id, username: p.username }))
    });

    // Start setup immediately when room has 2 players
    io.to(code).emit('match_found', {
      roomId: code,
      players: room.players.map(p => ({ id: p.id, username: p.username }))
    });

    console.log(`[NET] ${name} joined Room Code: ${code}`);
  });

  // Cancel Matchmaking
  socket.on('cancel_matchmaking', () => {
    matchmakingQueue = matchmakingQueue.filter(p => p.socketId !== socket.id);
    socket.emit('matchmaking_canceled');
    console.log(`[NET] Matchmaking canceled for ${socket.id}`);
  });

  // Setup ready signal with ships layout
  socket.on('player_ready', ({ roomId, ships }: { roomId: string; ships: ShipInstance[] }) => {
    const room = rooms.get(roomId);
    if (!room) return;

    const player = room.players.find(p => p.id === socket.id);
    if (!player) return;

    player.ships = ships;
    player.ready = true;

    // Send updated ready states to both
    io.to(roomId).emit('player_ready_state', {
      readyStates: room.players.map(p => ({ id: p.id, ready: p.ready }))
    });

    // Check if both players are finally ready to play
    if (room.players.length === 2 && room.players.every(p => p.ready)) {
      room.status = 'playing';
      // Pick random player to start first turn
      const randomStart = room.players[Math.floor(Math.random() * 2)].id;
      room.turn = randomStart;

      io.to(roomId).emit('game_started', {
        turn: room.turn,
        players: room.players.map(p => ({ id: p.id, username: p.username }))
      });
      console.log(`[NET] Room ${roomId}: Both ready. Game begins with first turn ${room.turn}`);
    }
  });

  // Firing action from a client
  socket.on('player_fire', ({ roomId, r, c }: { roomId: string; r: number; c: number }) => {
    const room = rooms.get(roomId);
    if (!room || room.status !== 'playing' || room.turn !== socket.id) return;

    const shooter = room.players.find(p => p.id === socket.id);
    const target = room.players.find(p => p.id !== socket.id);
    if (!shooter || !target) return;

    // Check if duplicate fire coordinate
    const isAlreadyShot = shooter.shots.some(s => s.r === r && s.c === c);
    if (isAlreadyShot) return;

    // Cross reference against target's boats
    const shipAtCoord = getShipAtCoordinate(r, c, target.ships);
    const hit = shipAtCoord !== null;
    let sunkShipType: ShipType | undefined;

    if (hit && shipAtCoord) {
      const { ship, index, segmentIndex } = shipAtCoord;
      target.ships[index].hits[segmentIndex] = true;

      // Check if ship qualifies as fully sunk
      const shipIsSunk = target.ships[index].hits.every(h => h);
      if (shipIsSunk) {
        target.ships[index].sunk = true;
        sunkShipType = ship.type;
      }

      // Record shot on shooter
      const currentShot: Shot = { r, c, hit: true, shipType: ship.type };
      shooter.shots.push(currentShot);

      // Hit gets another turn
      room.turn = shooter.id;

      io.to(roomId).emit('shot_result', {
        shooterId: shooter.id,
        targetId: target.id,
        r,
        c,
        hit: true,
        sunkShip: sunkShipType,
        nextTurn: room.turn
      });

      // Verify general win state
      const allSunk = target.ships.every(s => s.sunk);
      if (allSunk) {
        room.status = 'gameover';
        room.winner = shooter.id;
        io.to(roomId).emit('game_over', { winnerId: room.winner });
        console.log(`[NET] Room ${roomId} Game Over. Winner: ${shooter.username}`);
      }
    } else {
      // Record miss shot on shooter
      const currentShot: Shot = { r, c, hit: false };
      shooter.shots.push(currentShot);

      // Turn shifts to target
      room.turn = target.id;

      io.to(roomId).emit('shot_result', {
        shooterId: shooter.id,
        targetId: target.id,
        r,
        c,
        hit: false,
        nextTurn: room.turn
      });
    }
  });

  // Client requests reconnect or syncing after network fluctuation
  socket.on('sync_request', ({ roomId }: { roomId: string }) => {
    const room = rooms.get(roomId);
    if (!room) return;

    const isPlayer = room.players.some(p => p.id === socket.id);
    if (!isPlayer) return;

    socket.emit('sync_state', {
      roomId: room.id,
      status: room.status,
      turn: room.turn,
      winner: room.winner,
      players: room.players.map(p => ({
        id: p.id,
        username: p.username,
        ready: p.ready,
        shotsCount: p.shots.length,
        // Send actual ships state to client themselves
        ships: p.id === socket.id ? p.ships : p.ships.map(s => s.sunk ? s : { ...s, r: -1, c: -1 }), // Hide coordinates if opponent's ship not yet sunk
        shots: p.shots
      }))
    });
  });

  // Handle client disconnect
  socket.on('disconnect', () => {
    console.log(`[NET] Player left: ${socket.id}`);
    
    // Clear from matchmaking queue
    matchmakingQueue = matchmakingQueue.filter(p => p.socketId !== socket.id);

    // Audit active rooms
    for (const [roomId, room] of rooms.entries()) {
      const isPlayer = room.players.some(p => p.id === socket.id);
      if (isPlayer) {
        // Broadcast disconnection
        io.to(roomId).emit('player_disconnected', { id: socket.id });

        // If game is in playing state and a player leaves, automatically win the opponent
        if (room.status === 'playing') {
          const survivor = room.players.find(p => p.id !== socket.id);
          if (survivor) {
            room.status = 'gameover';
            room.winner = survivor.id;
            io.to(roomId).emit('game_over', { 
              winnerId: survivor.id, 
              abandoned: true,
              message: `Hạm đội đối phương (${room.players.find(p => p.id === socket.id)?.username}) bốc hơi ngoài tầm radar liên lục địa. Bạn chiến thắng!`
            });
          }
        }

        // Clean up empty or broken rooms
        const remainingPlayers = room.players.filter(p => p.id !== socket.id);
        if (remainingPlayers.length === 0) {
          rooms.delete(roomId);
          console.log(`[NET] Room ${roomId} cleared.`);
        } else {
          room.players = remainingPlayers;
        }
      }
    }
  });
});

// Configure Vite middleware in dev or static public routing in prod
async function bootServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`===============================================`);
    console.log(`   Battleship Server bound to 0.0.0.0:${PORT}`);
    console.log(`===============================================`);
  });
}

bootServer();
