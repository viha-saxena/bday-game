// Game.js - Main Game Logic with Character Selection
const socket = io();

// Game state
let myPlayerId = null;
let myRole = null;
let players = {};
let bullets = [];
let perks = [];
let boyHealth = 100;
let gameActive = false;
let specialUnlocked = false;
let currentBulletType = 'kutte';
let lastShootTime = 0;
const SHOOT_COOLDOWN = 300;

// Character selection state
let selectedCharacter = null;
let bothPlayersReady = false;

// Images
const images = {
    background: null,
    boy: null,
    girl: null
};

// Load images
function loadImages() {
    images.background = new Image();
    images.background.src = 'assets/canvas.jpg';
    
    images.boy = new Image();
    images.boy.src = 'assets/boy.jpg';
    
    images.girl = new Image();
    images.girl.src = 'assets/girl.jpg';
}

loadImages();

// CHARACTER SELECTION
document.querySelectorAll('.character-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const character = btn.getAttribute('data-character');
        selectCharacter(character);
    });
});

function selectCharacter(character) {
    if (selectedCharacter) return; // Already selected
    
    selectedCharacter = character;
    socket.emit('select-character', character);
    
    // Disable both buttons
    document.querySelectorAll('.character-btn').forEach(btn => {
        btn.classList.add('disabled');
    });
    
    // Highlight selected
    document.querySelector(`[data-character="${character}"]`).classList.add('selected');
    
    updateSelectionStatus('Waiting for other player...');
}

function updateSelectionStatus(message, type = 'waiting') {
    const status = document.getElementById('selection-status');
    status.textContent = message;
    status.className = type;
}

// Socket event handlers for character selection
socket.on('character-selected', (data) => {
    console.log('Character selected:', data);
    
    if (data.playerId === socket.id) {
        myPlayerId = data.playerId;
        myRole = data.character;
    }
});

socket.on('character-taken', () => {
    updateSelectionStatus('⚠️ Already chosen! Please select the other character.', 'error');
    
    // Re-enable buttons
    selectedCharacter = null;
    document.querySelectorAll('.character-btn').forEach(btn => {
        btn.classList.remove('disabled');
        btn.classList.remove('selected');
    });
});

socket.on('waiting-for-player', (data) => {
    const otherCharacter = data.waitingFor === 'girl' ? 'Aurat (Girl)' : 'Aadmi (Boy)';
    updateSelectionStatus(`⏳ ${otherCharacter} has not joined yet...`, 'waiting');
});

socket.on('both-players-ready', (data) => {
    updateSelectionStatus('✅ Both players ready! Loading story...', 'ready');
    
    myPlayerId = data.players[socket.id].playerId;
    myRole = data.players[socket.id].role;
    
    setTimeout(() => {
        showStoryScreen();
    }, 1500);
});

// STORY SCREEN
function showStoryScreen() {
    document.getElementById('character-selection').style.display = 'none';
    document.getElementById('story-screen').style.display = 'flex';
    
    // Set role-specific info
    const roleDisplay = document.getElementById('my-role-display');
    const objective = document.getElementById('my-objective');
    
    if (myRole === 'girl') {
        roleDisplay.textContent = '👩 You are: Aurat (The Shooter)';
        objective.textContent = 'Objective: Stop your aadmi from going to office! Shoot him with love bullets and make him surrender!';
    } else {
        roleDisplay.textContent = '👨 You are: Aadmi (The Runner)';
        objective.textContent = 'Objective: You need to reach the office door! Dodge her bullets and escape... if you can!';
    }
}

// START GAME BUTTON
document.getElementById('start-game-btn').addEventListener('click', () => {
    socket.emit('ready-to-play');
});

socket.on('start-gameplay', (data) => {
    document.getElementById('story-screen').style.display = 'none';
    document.getElementById('game-screen').style.display = 'flex';
    
    // Initialize game
    initializeGame(data);
});

function initializeGame(data) {
    // Initialize canvas after it's visible
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');
    
    window.canvas = canvas;
    window.ctx = ctx;
    
    // Update UI
    document.getElementById('role-display').textContent = 
        `You are: ${myRole === 'girl' ? '👩 Girl (Shooter)' : '👨 Boy (Runner)'}`;
    
    if (myRole === 'girl') {
        document.getElementById('bullet-selector').style.display = 'block';
        document.getElementById('shoot-info').style.display = 'block';
    }
    
    // Initialize players
    players = {};
    for (let id in data.gameState.players) {
        const p = data.gameState.players[id];
        players[id] = new Player(id, p.role, p.x, p.y);
    }
    
    gameActive = true;
    boyHealth = 100;
    updateHealthBar();
    
    // Start game loop
    gameLoop();
    
    // Start perk spawning
    spawnPerksInterval();
}

// Player class
class Player {
    constructor(id, role, x, y) {
        this.id = id;
        this.role = role;
        this.x = x;
        this.y = y;
        this.width = 55;
        this.height = 66;
        this.speed = 4;
    }

    draw() {
        const img = this.role === 'boy' ? images.boy : images.girl;
        if (img.complete) {
            ctx.drawImage(img, this.x - this.width/2, this.y - this.height/2, this.width, this.height);
        } else {
            ctx.fillStyle = this.role === 'boy' ? '#4a90e2' : '#ff69b4';
            ctx.fillRect(this.x - this.width/2, this.y - this.height/2, this.width, this.height);
        }

        ctx.fillStyle = 'black';
        ctx.font = 'bold 14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(this.role === 'boy' ? 'Aadmi' : 'Love', this.x, this.y - 45);
    }

    move(dx, dy) {
        this.x += dx * this.speed;
        this.y += dy * this.speed;
        this.x = Math.max(30, Math.min(canvas.width - 30, this.x));
        this.y = Math.max(35, Math.min(canvas.height - 35, this.y));
    }
}

// Bullet class
class Bullet {
    constructor(x, y, dx, dy, type, directions = 1) {
        this.x = x;
        this.y = y;
        this.dx = dx;
        this.dy = dy;
        this.type = type;
        this.directions = directions;
        this.speed = 6;
        this.width = 15;
        this.height = 15;
        
        this.damage = {
            'kutte': 4,
            'gadhe': 3,
            'shabash': 5,
            'special': 100
        }[type] || 0;
    }

    draw() {
        ctx.save();
        
        if (this.type === 'special') {
            ctx.fillStyle = '#ff1493';
            ctx.font = 'bold 28px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('❤️', this.x, this.y);
        } else {
            ctx.fillStyle = this.type === 'kutte' ? '#ff6b6b' : 
                           this.type === 'gadhe' ? '#ffa500' : '#90ee90';
            ctx.beginPath();
            ctx.arc(this.x, this.y, 12, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 2;
            ctx.stroke();
            
            ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
            ctx.shadowBlur = 3;
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 10px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(this.type.toUpperCase(), this.x, this.y);
        }
        
        ctx.restore();
    }

    update() {
        this.x += this.dx * this.speed;
        this.y += this.dy * this.speed;
    }

    isOffScreen() {
        return this.x < 0 || this.x > canvas.width || 
               this.y < 0 || this.y > canvas.height;
    }

    checkCollision(player) {
        if (player.role !== 'boy') return false;
        const dist = Math.sqrt(
            Math.pow(this.x - player.x, 2) + 
            Math.pow(this.y - player.y, 2)
        );
        return dist < (player.width/2 + this.width);
    }
}

// Perk class
class Perk {
    constructor(x, y, type) {
        this.x = x;
        this.y = y;
        this.type = type;
        this.radius = 20;
        this.collected = false;
    }

    draw() {
        if (this.collected) return;
        
        ctx.save();
        ctx.fillStyle = '#ffd700';
        ctx.strokeStyle = '#ff8c00';
        ctx.lineWidth = 3;
        
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        
        ctx.fillStyle = 'white';
        ctx.font = 'bold 16px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(this.type + 'D', this.x, this.y);
        
        ctx.restore();
    }

    checkCollision(player) {
        if (this.collected) return false;
        const dist = Math.sqrt(
            Math.pow(this.x - player.x, 2) + 
            Math.pow(this.y - player.y, 2)
        );
        return dist < (player.width/2 + this.radius);
    }
}

// Continue with rest of socket handlers and game logic...
// (Rest of the code remains the same as before - socket handlers, input, draw, update, etc.)

socket.on('player-moved', (data) => {
    if (players[data.playerId]) {
        players[data.playerId].x = data.x;
        players[data.playerId].y = data.y;
    }
});

socket.on('bullet-fired', (data) => {
    if (data.directions === 1) {
        bullets.push(new Bullet(data.x, data.y, data.dx, data.dy, data.type));
    } else {
        for (let i = 0; i < data.directions; i++) {
            const angle = (Math.PI * 2 / data.directions) * i;
            const dx = Math.cos(angle);
            const dy = Math.sin(angle);
            bullets.push(new Bullet(data.x, data.y, dx, dy, data.type));
        }
    }
});

socket.on('health-update', (data) => {
    boyHealth = data.health;
    updateHealthBar();
});

socket.on('special-unlocked', () => {
    specialUnlocked = true;
    document.getElementById('special-notice').style.display = 'block';
});

socket.on('game-over', (data) => {
    gameActive = false;
    showGameOver(data);
});

socket.on('game-reset', () => {
    gameActive = false;
    bullets = [];
    perks = [];
    boyHealth = 100;
    specialUnlocked = false;
    document.getElementById('game-message').style.display = 'none';
    document.getElementById('special-notice').style.display = 'none';
    updateHealthBar();
});

// Input handling
const keys = {};
window.addEventListener('keydown', (e) => {
    keys[e.key] = true;
    
    if (myRole === 'girl') {
        if (e.key === '1') selectBulletType('kutte');
        if (e.key === '2') selectBulletType('gadhe');
        if (e.key === '3') selectBulletType('shabash');
        
        if (e.key === 'h' || e.key === 'H') {
            if (specialUnlocked) {
                shootSpecialBullet();
            }
        }
        
        if (e.key === ' ') {
            shoot();
        }
    }
});

window.addEventListener('keyup', (e) => {
    keys[e.key] = false;
});

canvas && canvas.addEventListener('click', (e) => {
    if (myRole === 'girl' && gameActive) {
        const rect = canvas.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const clickY = e.clientY - rect.top;
        shootTowards(clickX, clickY);
    }
});

document.querySelectorAll('.bullet-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const type = btn.getAttribute('data-type');
        selectBulletType(type);
    });
});

function selectBulletType(type) {
    currentBulletType = type;
    document.querySelectorAll('.bullet-btn').forEach(b => b.classList.remove('active'));
    document.querySelector(`[data-type="${type}"]`).classList.add('active');
}

function shoot() {
    if (!gameActive || myRole !== 'girl') return;
    const now = Date.now();
    if (now - lastShootTime < SHOOT_COOLDOWN) return;
    lastShootTime = now;
    
    const me = players[myPlayerId];
    if (!me) return;
    
    const boy = Object.values(players).find(p => p.role === 'boy');
    if (boy) {
        const dx = boy.x - me.x;
        const dy = boy.y - me.y;
        const length = Math.sqrt(dx * dx + dy * dy);
        
        socket.emit('shoot', {
            x: me.x,
            y: me.y,
            dx: dx / length,
            dy: dy / length,
            type: currentBulletType,
            directions: 1
        });
    }
}

function shootTowards(targetX, targetY) {
    if (!gameActive || myRole !== 'girl') return;
    const now = Date.now();
    if (now - lastShootTime < SHOOT_COOLDOWN) return;
    lastShootTime = now;
    
    const me = players[myPlayerId];
    if (!me) return;
    
    const dx = targetX - me.x;
    const dy = targetY - me.y;
    const length = Math.sqrt(dx * dx + dy * dy);
    
    socket.emit('shoot', {
        x: me.x,
        y: me.y,
        dx: dx / length,
        dy: dy / length,
        type: currentBulletType,
        directions: 1
    });
}

function shootSpecialBullet() {
    if (!specialUnlocked || myRole !== 'girl') return;
    
    const me = players[myPlayerId];
    if (!me) return;
    
    const boy = Object.values(players).find(p => p.role === 'boy');
    if (boy) {
        const dx = boy.x - me.x;
        const dy = boy.y - me.y;
        const length = Math.sqrt(dx * dx + dy * dy);
        
        socket.emit('shoot', {
            x: me.x,
            y: me.y,
            dx: dx / length,
            dy: dy / length,
            type: 'special',
            directions: 1
        });
        
        specialUnlocked = false;
        document.getElementById('special-notice').style.display = 'none';
    }
}

function update() {
    if (!gameActive) return;
    
    const me = players[myPlayerId];
    if (!me) return;
    
    let dx = 0, dy = 0;
    if (keys['ArrowLeft']) dx = -1;
    if (keys['ArrowRight']) dx = 1;
    if (keys['ArrowUp']) dy = -1;
    if (keys['ArrowDown']) dy = 1;
    
    if (dx !== 0 || dy !== 0) {
        me.move(dx, dy);
        socket.emit('move', { x: me.x, y: me.y });
    }
    
    bullets = bullets.filter(bullet => {
        bullet.update();
        
        if (me.role === 'boy' && bullet.checkCollision(me)) {
            socket.emit('hit', { 
                damage: bullet.damage,
                isSpecial: bullet.type === 'special'
            });
            return false;
        }
        
        return !bullet.isOffScreen();
    });
    
    if (me.role === 'boy' && me.x > canvas.width - 80) {
        socket.emit('reached-door');
    }
    
    perks.forEach(perk => {
        if (perk.checkCollision(me) && !perk.collected) {
            perk.collected = true;
            if (me.role === 'girl') {
                activatePerk(perk.type);
            }
        }
    });
}

function draw() {
    if (!canvas || !ctx) return;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    if (images.background.complete) {
        ctx.drawImage(images.background, 0, 0, canvas.width, canvas.height);
    } else {
        ctx.fillStyle = '#f0f0f0';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    
    ctx.fillStyle = 'rgba(255, 215, 0, 0.3)';
    ctx.fillRect(canvas.width - 80, 0, 80, canvas.height);
    ctx.strokeStyle = '#ffd700';
    ctx.lineWidth = 5;
    ctx.strokeRect(canvas.width - 80, 0, 80, canvas.height);
    
    ctx.fillStyle = '#ff8c00';
    ctx.font = 'bold 20px Arial';
    ctx.textAlign = 'center';
    ctx.save();
    ctx.translate(canvas.width - 40, canvas.height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('DOOR', 0, 0);
    ctx.restore();
    
    perks.forEach(perk => perk.draw());
    bullets.forEach(bullet => bullet.draw());
    
    for (let id in players) {
        players[id].draw();
    }
    
    if (myRole === 'girl' && !specialUnlocked && boyHealth < 20) {
        ctx.fillStyle = 'rgba(255, 20, 147, 0.8)';
        ctx.fillRect(canvas.width/2 - 150, 20, 300, 40);
        ctx.fillStyle = 'white';
        ctx.font = 'bold 18px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Press H for Special Bullet! ❤️', canvas.width/2, 45);
    }
}

function gameLoop() {
    if (gameActive) {
        update();
        draw();
    }
    requestAnimationFrame(gameLoop);
}

let perkInterval;
function spawnPerksInterval() {
    clearInterval(perkInterval);
    perkInterval = setInterval(() => {
        if (gameActive) {
            spawnPerk();
        }
    }, 25000);
}

function spawnPerk() {
    const x = Math.random() * (canvas.width - 200) + 100;
    const y = Math.random() * (canvas.height - 100) + 50;
    const type = Math.floor(Math.random() * 3) + 1;
    
    perks.push(new Perk(x, y, type));
    
    setTimeout(() => {
        perks = perks.filter(p => p.collected || (p.x !== x || p.y !== y));
    }, 10000);
}

function activatePerk(type) {
    const me = players[myPlayerId];
    if (!me) return;
    
    const angles = [];
    for (let i = 0; i < type; i++) {
        angles.push((Math.PI * 2 / type) * i);
    }
    
    angles.forEach(angle => {
        const dx = Math.cos(angle);
        const dy = Math.sin(angle);
        
        socket.emit('shoot', {
            x: me.x,
            y: me.y,
            dx: dx,
            dy: dy,
            type: currentBulletType,
            directions: 1
        });
    });
}

function updateHealthBar() {
    const healthFill = document.getElementById('health-fill');
    const healthText = document.getElementById('health-text');
    
    healthFill.style.width = Math.max(0, boyHealth) + '%';
    healthText.textContent = Math.max(0, Math.round(boyHealth)) + '%';
    
    if (boyHealth < 20) {
        healthFill.classList.add('low');
    } else {
        healthFill.classList.remove('low');
    }
}

function showGameOver(data) {
    const messageDiv = document.getElementById('game-message');
    let message = '';
    
    if (data.winner === 'girl') {
        if (data.ending === 'love') {
            message = `
                <div class="heart">❤️</div>
                <h2>I Surrender to Your Love!</h2>
                <div class="kiss">💋 💋 💋</div>
                <p>Aadmi ne haar maan li pyaar ke aage...</p>
                <div style="margin-top: 20px; font-size: 48px;">👨‍❤️‍💋‍👩</div>
            `;
            
            setTimeout(() => {
                for (let i = 0; i < 10; i++) {
                    setTimeout(() => {
                        createFloatingHeart();
                    }, i * 300);
                }
            }, 500);
        } else {
            message = `
                <h2>You Won!</h2>
                <p>But aadmi is little sad... 😔</p>
                <p>He wanted to go to office on your birthday</p>
            `;
        }
    } else if (data.winner === 'boy') {
        message = `
            <h2>Aadmi Office Chala Gaya 💔</h2>
            <p>He escaped on your birthday...</p>
            <p>Girl is sad now 😢</p>
        `;
    }
    
    messageDiv.innerHTML = message;
    messageDiv.style.display = 'block';
    
    setTimeout(() => {
        const reloadBtn = document.createElement('button');
        reloadBtn.textContent = 'Play Again';
        reloadBtn.style.cssText = `
            margin-top: 20px;
            padding: 15px 30px;
            font-size: 20px;
            background: #764ba2;
            color: white;
            border: none;
            border-radius: 10px;
            cursor: pointer;
        `;
        reloadBtn.onclick = () => {
            socket.emit('request-restart');
        };
        messageDiv.appendChild(reloadBtn);
    }, 3000);
}

function createFloatingHeart() {
    const heart = document.createElement('div');
    heart.textContent = 'I love ❤️ U aadmi';
    heart.style.cssText = `
        position: fixed;
        font-size: 40px;
        left: ${Math.random() * window.innerWidth}px;
        top: ${window.innerHeight}px;
        pointer-events: none;
        z-index: 9999;
        animation: floatUp 3s ease-out forwards;
    `;
    document.body.appendChild(heart);
    setTimeout(() => heart.remove(), 3000);
}

const style = document.createElement('style');
style.textContent = `
    @keyframes floatUp {
        to {
            transform: translateY(-${window.innerHeight + 100}px);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);

setInterval(() => {
    if (gameActive && myRole === 'girl' && keys[' ']) {
        shoot();
    }
}, SHOOT_COOLDOWN);

console.log('Game initialized! Waiting for character selection...');
