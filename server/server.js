const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');

app.use(express.static(path.join(__dirname, '../client')));

// Game state with character selection
let gameState = {
  players: {},
  selectedCharacters: {
    girl: null,
    boy: null
  },
  boyHealth: 100,
  gameActive: false,
  specialUnlocked: false,
  bothReady: false,
  readyCount: 0
};

let playerCount = 0;
const MAX_PLAYERS = 2;

function resetGame() {
  gameState.boyHealth = 100;
  gameState.gameActive = true;
  gameState.specialUnlocked = false;
  gameState.readyCount = 0;
  
  for (let id in gameState.players) {
    const player = gameState.players[id];
    player.x = player.role === 'girl' ? 700 : 100;
    player.y = 300;
  }
}

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  if (playerCount >= MAX_PLAYERS) {
    socket.emit('game-full');
    socket.disconnect();
    return;
  }

  playerCount++;

  // CHARACTER SELECTION
  socket.on('select-character', (character) => {
    console.log(`${socket.id} wants to select: ${character}`);
    
    // Check if character already taken
    if (gameState.selectedCharacters[character]) {
      socket.emit('character-taken');
      return;
    }
    
    // Assign character
    gameState.selectedCharacters[character] = socket.id;
    gameState.players[socket.id] = {
      id: socket.id,
      role: character,
      x: character === 'girl' ? 700 : 100,
      y: 300
    };
    
    socket.emit('character-selected', {
      playerId: socket.id,
      character: character
    });
    
    // Check if both players have selected
    if (gameState.selectedCharacters.girl && gameState.selectedCharacters.boy) {
      // Both players selected
      console.log('Both players selected characters!');
      
      const playersData = {};
      playersData[gameState.selectedCharacters.girl] = {
        playerId: gameState.selectedCharacters.girl,
        role: 'girl'
      };
      playersData[gameState.selectedCharacters.boy] = {
        playerId: gameState.selectedCharacters.boy,
        role: 'boy'
      };
      
      io.emit('both-players-ready', {
        players: playersData
      });
    } else {
      // Waiting for other player
      const waitingFor = character === 'girl' ? 'boy' : 'girl';
      socket.emit('waiting-for-player', { waitingFor });
    }
  });

  // READY TO PLAY
  socket.on('ready-to-play', () => {
    console.log(`${socket.id} is ready to play`);
    gameState.readyCount++;
    
    if (gameState.readyCount >= 2) {
      // Both players ready, start game
      gameState.gameActive = true;
      gameState.boyHealth = 100;
      
      io.emit('start-gameplay', {
        gameState: gameState
      });
      
      console.log('Game started!');
    }
  });

  socket.on('move', (data) => {
    if (gameState.players[socket.id]) {
      gameState.players[socket.id].x = data.x;
      gameState.players[socket.id].y = data.y;
      
      socket.broadcast.emit('player-moved', {
        playerId: socket.id,
        x: data.x,
        y: data.y
      });
    }
  });

  socket.on('shoot', (data) => {
    const player = gameState.players[socket.id];
    if (player && player.role === 'girl') {
      io.emit('bullet-fired', {
        x: data.x,
        y: data.y,
        dx: data.dx,
        dy: data.dy,
        type: data.type,
        directions: data.directions || 1
      });
    }
  });

  socket.on('hit', (data) => {
    if (gameState.gameActive) {
      gameState.boyHealth -= data.damage;
      
      if (gameState.boyHealth < 20 && !gameState.specialUnlocked) {
        gameState.specialUnlocked = true;
        io.emit('special-unlocked');
      }

      io.emit('health-update', {
        health: gameState.boyHealth
      });

      if (gameState.boyHealth <= 0) {
        gameState.gameActive = false;
        io.emit('game-over', {
          winner: 'girl',
          ending: data.isSpecial ? 'love' : 'regular'
        });
      }
    }
  });

  socket.on('reached-door', () => {
    const player = gameState.players[socket.id];
    if (player && player.role === 'boy' && gameState.gameActive) {
      gameState.gameActive = false;
      io.emit('game-over', {
        winner: 'boy',
        ending: 'escape'
      });
    }
  });

  socket.on('request-restart', () => {
    console.log('Restart requested');
    resetGame();
    io.emit('game-reset');
    io.emit('start-gameplay', { gameState: gameState });
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    
    // Remove from selected characters
    if (gameState.players[socket.id]) {
      const role = gameState.players[socket.id].role;
      gameState.selectedCharacters[role] = null;
    }
    
    delete gameState.players[socket.id];
    playerCount--;
    
    io.emit('player-left', socket.id);
    
    if (gameState.gameActive) {
      gameState.gameActive = false;
      gameState.boyHealth = 100;
      gameState.specialUnlocked = false;
      gameState.readyCount = 0;
      io.emit('game-reset');
    }
  });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
