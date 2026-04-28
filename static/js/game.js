const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const paddleWidth = 10;
const paddleHeight = 100;
let paddleSpeed = DIFFICULTY_SETTINGS.MEDIUM.paddleSpeed;

let currentDifficulty = 'MEDIUM';
const DIFFICULTY_SETTINGS = {
    EASY: {
        paddleSpeed: 4,
        aiSpeed: 4,
        reactionDelay: 40,
        maxBallSpeed: 14,
        startBallSpeed: 4,
        name: '🟢 Лёгкий'
    },
    MEDIUM: {
        paddleSpeed: 6,
        aiSpeed: 8,
        reactionDelay: 25,
        maxBallSpeed: 18,
        startBallSpeed: 5,
        name: '🟡 Средний'
    },
    HARD: {
        paddleSpeed: 8,
        aiSpeed: 12,
        reactionDelay: 15,
        maxBallSpeed: 22,
        startBallSpeed: 6,
        name: '🔴 Сложный'
    }
};

function setDifficulty(level) {
    currentDifficulty = level;
    const settings = DIFFICULTY_SETTINGS[level];
    
    document.getElementById('difficultyDisplay').innerHTML = settings.name;
    paddleSpeed = settings.paddleSpeed;
    
    ACTION_DELAY = settings.reactionDelay;
    
    console.log(`Сложность изменена на ${level}`);
}

let ballX = canvas.width / 2;
let ballY = canvas.height / 2;
let ballSpeedX = 5;
let ballSpeedY = (Math.random() > 0.5 ? 4 : -4);
let ballRadius = 10;

let leftPaddleY = (canvas.height - paddleHeight) / 2;
let rightPaddleY = (canvas.height - paddleHeight) / 2;
let paddleVelocity = 0;

let leftScore = 0;
let rightScore = 0;

let predictedX = ballX;
let predictedY = ballY;

let currentAction = 'stop';
let actionCooldown = 0;
let ACTION_DELAY = DIFFICULTY_SETTINGS.MEDIUM.reactionDelay;

let gameRunning = true;
let gameStarted = false;
let countdownValue = 3;
let countdownInterval = null;

let autoMode = false;
let autoTrainingActive = false;
let autoTrainingGames = 0;
let autoTrainingComplete = 0;

let lastRightPaddleY = rightPaddleY;
let lastLeftPaddleY = leftPaddleY;

function applyPaddleBounce(paddleY, isRightPaddle) {
    const paddleCenter = paddleY + paddleHeight / 2;
    const hitPos = (ballY - paddleCenter) / (paddleHeight / 2);
    const clamped = Math.max(-1, Math.min(1, hitPos));
    const MAX_ANGLE = Math.PI / 3;
    const angle = clamped * MAX_ANGLE;
    const speed = Math.sqrt(ballSpeedX * ballSpeedX + ballSpeedY * ballSpeedY);
    const direction = isRightPaddle ? -1 : 1;
    ballSpeedX = Math.cos(angle) * speed * direction;
    ballSpeedY = Math.sin(angle) * speed;
}

canvas.addEventListener('mousemove', (e) => {
    if (!gameRunning || !gameStarted) return;
    const rect = canvas.getBoundingClientRect();
    leftPaddleY = e.clientY - rect.top - paddleHeight / 2;
    if (leftPaddleY < 0) leftPaddleY = 0;
    if (leftPaddleY > canvas.height - paddleHeight) leftPaddleY = canvas.height - paddleHeight;
});

async function getAiAction() {
    if (!gameRunning || !gameStarted) return 'stop';
    const response = await fetch('/predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            ball_y: ballY,
            ball_speed_y: ballSpeedY,
            ball_speed_x: ballSpeedX,
            right_paddle_y: rightPaddleY
        })
    });
    const data = await response.json();
    
    if (data.predicted_y) {
        predictedY = data.predicted_y;
        predictedX = data.predicted_x || (ballX + ballSpeedX * 15);
    }
    
    return data.action;
}

async function updateAI() {
    if (!gameRunning || !gameStarted) return;
    
    const settings = DIFFICULTY_SETTINGS[currentDifficulty];
    
    if (actionCooldown > 0) {
        actionCooldown--;
    } else {
        const newAction = await getAiAction();
        currentAction = newAction;
        actionCooldown = ACTION_DELAY;
    }

    let center = rightPaddleY + paddleHeight / 2;
    let diff = predictedY - center;
    
    let speed = Math.sqrt(ballSpeedX * ballSpeedX + ballSpeedY * ballSpeedY);
    const DIFFICULTY = Math.min(1.5, speed / 8);
    const DEADZONE = (35 / DIFFICULTY) * (currentDifficulty === 'EASY' ? 1.5 : currentDifficulty === 'HARD' ? 0.7 : 1);
    const MAX_SPEED = settings.aiSpeed + speed * 0.2;
    const ACCELERATION = (0.3 + speed * 0.02) * (currentDifficulty === 'EASY' ? 0.7 : currentDifficulty === 'HARD' ? 1.3 : 1);
    const FRICTION = 0.85;

    let targetVelocity = 0;

    if (Math.abs(diff) > DEADZONE) {
        targetVelocity = Math.sign(diff) * Math.min(MAX_SPEED, Math.abs(diff) * 0.2);
    }

    paddleVelocity += (targetVelocity - paddleVelocity) * ACCELERATION;
    paddleVelocity *= FRICTION;
    rightPaddleY += paddleVelocity;

    if (rightPaddleY < 0) {
        rightPaddleY = 0;
        paddleVelocity = 0;
    }

    if (rightPaddleY > canvas.height - paddleHeight) {
        rightPaddleY = canvas.height - paddleHeight;
        paddleVelocity = 0;
    }
}

async function updateLeftAI() {
    if (!autoMode) return;
    
    let center = leftPaddleY + paddleHeight / 2;
    let diff = predictedY - center;
    
    let targetY = leftPaddleY;
    if (Math.abs(diff) > 30) {
        targetY = leftPaddleY + Math.sign(diff) * paddleSpeed * 0.6;
    }
    
    if (targetY < 0) targetY = 0;
    if (targetY > canvas.height - paddleHeight) targetY = canvas.height - paddleHeight;
    
    leftPaddleY = leftPaddleY + (targetY - leftPaddleY) * 0.3;
}

async function startAutoTraining(games) {
    if (autoTrainingActive) return;
    
    autoTrainingActive = true;
    autoTrainingGames = games;
    autoTrainingComplete = 0;
    autoMode = true;
    gameStarted = true;
    gameRunning = true;
    
    const statusDiv = document.getElementById('autoStatus');
    statusDiv.style.display = 'block';
    statusDiv.innerHTML = `🔄 Авто-обучение: 0/${games} | Запуск...`;
    
    for (let i = 0; i < games; i++) {
        if (!autoTrainingActive) break;
        
        leftScore = 0;
        rightScore = 0;
        ballX = canvas.width / 2;
        ballY = canvas.height / 2;
        ballSpeedX = (Math.random() > 0.5 ? 5 : -5);
        ballSpeedY = (Math.random() > 0.5 ? 4 : -4);
        leftPaddleY = (canvas.height - paddleHeight) / 2;
        rightPaddleY = (canvas.height - paddleHeight) / 2;
        paddleVelocity = 0;
        
        let gameActive = true;
        let maxFrames = 4000;
        let frames = 0;
        
        while (gameActive && frames < maxFrames && autoTrainingActive) {
            let centerRight = rightPaddleY + paddleHeight / 2;
            let diffRight = predictedY - centerRight;
            if (Math.abs(diffRight) > 25) {
                rightPaddleY += Math.sign(diffRight) * paddleSpeed * 0.8;
            }
            rightPaddleY = Math.max(0, Math.min(rightPaddleY, canvas.height - paddleHeight));
            
            if (autoMode) {
                let centerLeft = leftPaddleY + paddleHeight / 2;
                let diffLeft = predictedY - centerLeft;
                if (Math.abs(diffLeft) > 25) {
                    leftPaddleY += Math.sign(diffLeft) * paddleSpeed * 0.8;
                }
                leftPaddleY = Math.max(0, Math.min(leftPaddleY, canvas.height - paddleHeight));
            }
            
            ballX += ballSpeedX;
            ballY += ballSpeedY;
            
            if (ballY + ballRadius > canvas.height) {
                ballY = canvas.height - ballRadius;
                ballSpeedY = -ballSpeedY;
            }
            if (ballY - ballRadius < 0) {
                ballY = ballRadius;
                ballSpeedY = -ballSpeedY;
            }
            
            const leftPaddleX = 20;
            const rightPaddleX = canvas.width - 30;
            
            if (ballSpeedX < 0 && 
                ballX - ballRadius < leftPaddleX + paddleWidth && 
                ballX + ballRadius > leftPaddleX &&
                ballY + ballRadius > leftPaddleY && 
                ballY - ballRadius < leftPaddleY + paddleHeight) {
                ballX = leftPaddleX + paddleWidth + ballRadius;
                ballSpeedX = -ballSpeedX;
                ballSpeedY += (Math.random() - 0.5) * 2;
                ballSpeedY = Math.max(-10, Math.min(10, ballSpeedY));
                await sendReward(true, false, false);
            }
            
            if (ballSpeedX > 0 && 
                ballX + ballRadius > rightPaddleX && 
                ballX - ballRadius < rightPaddleX + paddleWidth &&
                ballY + ballRadius > rightPaddleY && 
                ballY - ballRadius < rightPaddleY + paddleHeight) {
                ballX = rightPaddleX - ballRadius;
                ballSpeedX = -ballSpeedX;
                ballSpeedY += (Math.random() - 0.5) * 2;
                ballSpeedY = Math.max(-10, Math.min(10, ballSpeedY));
                await sendReward(true, false, false);
            }
            
            if (ballX + ballRadius < 0) {
                rightScore++;
                await sendReward(false, true, true);
                resetBall('left');
                gameActive = false;
            } else if (ballX - ballRadius > canvas.width) {
                leftScore++;
                await sendReward(true, false, false);
                resetBall('right');
                gameActive = false;
            }
            
            frames++;
        }
        
        autoTrainingComplete++;
        statusDiv.innerHTML = `🔄 Авто-обучение: ${autoTrainingComplete}/${autoTrainingGames} | Счёт: ${leftScore}:${rightScore}`;
        
        await new Promise(r => setTimeout(r, 10));
    }
    
    autoTrainingActive = false;
    autoMode = false;
    gameStarted = false;
    gameRunning = true;
    statusDiv.style.display = 'none';
    alert(`Авто-обучение завершено! Проведено партий: ${autoTrainingComplete}`);
}

function stopAutoTraining() {
    if (autoTrainingActive) {
        autoTrainingActive = false;
        autoMode = false;
        gameStarted = false;
        gameRunning = true;
        document.getElementById('autoStatus').style.display = 'none';
        console.log('Авто-обучение остановлено');
    }
}

function draw() {
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.fillStyle = '#fff';
    ctx.font = '30px monospace';
    ctx.fillText(leftScore, canvas.width / 4, 50);
    ctx.fillText(rightScore, canvas.width * 3 / 4, 50);
    
    if (!gameStarted) {
        ctx.fillStyle = '#00ff88';
        ctx.font = 'bold 36px monospace';
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#00ff88';
        ctx.fillText('CLICK START', canvas.width/2 - 100, canvas.height/2);
        ctx.shadowBlur = 0;
    } else if (!gameRunning && gameStarted) {
        ctx.fillStyle = '#ffaa00';
        ctx.font = 'bold 36px monospace';
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#ffaa00';
        ctx.fillText('PAUSED', canvas.width/2 - 60, canvas.height/2);
        ctx.shadowBlur = 0;
    } else if (countdownValue > 0 && gameStarted && gameRunning) {
        ctx.fillStyle = '#ffaa00';
        ctx.font = 'bold 48px monospace';
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#ffaa00';
        ctx.fillText(countdownValue, canvas.width/2 - 15, canvas.height/2);
        ctx.shadowBlur = 0;
    }
    
    ctx.fillStyle = '#ff4444';
    ctx.beginPath();
    ctx.arc(predictedX, predictedY, 6, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.beginPath();
    ctx.moveTo(ballX, ballY);
    ctx.lineTo(predictedX, predictedY);
    ctx.strokeStyle = '#ff4444';
    ctx.setLineDash([5, 5]);
    ctx.stroke();
    ctx.setLineDash([]);
    
    ctx.font = '12px monospace';
    ctx.fillStyle = '#888';
    ctx.fillText(`AI: ${currentAction}`, canvas.width - 80, 30);
    ctx.fillText(`Pred Y: ${Math.round(predictedY)}`, canvas.width - 80, 50);
    
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(ballX, ballY, ballRadius, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.fillStyle = '#0f0';
    ctx.fillRect(20, leftPaddleY, paddleWidth, paddleHeight);
    ctx.fillRect(canvas.width - 30, rightPaddleY, paddleWidth, paddleHeight);
}

let hitPaddleThisFrame = false;

function updateGame() {
    if (!gameRunning || !gameStarted || countdownValue > 0) return;
    
    const settings = DIFFICULTY_SETTINGS[currentDifficulty];
    
    let newX = ballX + ballSpeedX;
    let newY = ballY + ballSpeedY;
    
    if (newY + ballRadius > canvas.height) {
        newY = canvas.height - ballRadius;
        ballSpeedY = -ballSpeedY;
    }
    if (newY - ballRadius < 0) {
        newY = ballRadius;
        ballSpeedY = -ballSpeedY;
    }
    
    const leftPaddleX = 20;
    const rightPaddleX = canvas.width - 30;
    
    if (ballSpeedX < 0 && 
        newX - ballRadius < leftPaddleX + paddleWidth && 
        newX + ballRadius > leftPaddleX &&
        newY + ballRadius > leftPaddleY && 
        newY - ballRadius < leftPaddleY + paddleHeight) {
        
        newX = leftPaddleX + paddleWidth + ballRadius;
        ballSpeedX = -ballSpeedX;
        
        const SPEED_INCREASE = 1.08;
        ballSpeedX *= SPEED_INCREASE;
        ballSpeedY *= SPEED_INCREASE;
        
        ballSpeedY += (Math.random() - 0.5) * 2;
        ballSpeedY = Math.max(-settings.maxBallSpeed, Math.min(settings.maxBallSpeed, ballSpeedY));
    }
    
    if (ballSpeedX > 0 && 
        newX + ballRadius > rightPaddleX && 
        newX - ballRadius < rightPaddleX + paddleWidth &&
        newY + ballRadius > rightPaddleY && 
        newY - ballRadius < rightPaddleY + paddleHeight) {
        
        newX = rightPaddleX - ballRadius;
        ballSpeedX = -ballSpeedX;
        hitPaddleThisFrame = true;
        
        const SPEED_INCREASE = 1.08;
        ballSpeedX *= SPEED_INCREASE;
        ballSpeedY *= SPEED_INCREASE;
        
        ballSpeedY += (Math.random() - 0.5) * 2;
        ballSpeedY = Math.max(-settings.maxBallSpeed, Math.min(settings.maxBallSpeed, ballSpeedY));
    }
    
    ballX = newX;
    ballY = newY;
    
    if (ballX + ballRadius < 0) {
        rightScore++;
        sendReward(false, true, true);
        resetBall('left');
        hitPaddleThisFrame = false;
    } else if (ballX - ballRadius > canvas.width) {
        leftScore++;
        sendReward(true, false, false);
        resetBall('right');
        hitPaddleThisFrame = false;
    } else if (hitPaddleThisFrame) {
        sendReward(true, false, false);
        hitPaddleThisFrame = false;
    }
    
    let speed = Math.sqrt(ballSpeedX * ballSpeedX + ballSpeedY * ballSpeedY);
    
    if (speed > settings.maxBallSpeed) {
        let scale = settings.maxBallSpeed / speed;
        ballSpeedX *= scale;
        ballSpeedY *= scale;
    }
}

async function sendReward(hit, goalForAI, goalForPlayer) {
    let rewardValue = 0;
    
    if (hit) rewardValue += 15;
    if (goalForAI) rewardValue -= 20;
    if (goalForPlayer) rewardValue += 10;
    
    const rewardSpan = document.getElementById('lastReward');
    if (rewardSpan) {
        rewardSpan.textContent = rewardValue;
        rewardSpan.style.color = rewardValue >= 0 ? '#0f0' : '#f00';
        setTimeout(() => {
            rewardSpan.style.color = '#fff';
        }, 500);
    }
    
    const actionSpan = document.getElementById('aiAction');
    if (actionSpan) {
        actionSpan.textContent = currentAction;
    }
    
    await fetch('/reward', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            hit_paddle: hit,
            goal_scored: goalForPlayer,
            is_my_goal: goalForAI,
            next_ball_y: ballY,
            next_ball_speed_y: ballSpeedY,
            next_right_paddle_y: rightPaddleY,
            left_score: leftScore,
            right_score: rightScore
        })
    });
}

function resetBall(side) {
    ballX = canvas.width / 2;
    ballY = canvas.height / 2;
    
    const settings = DIFFICULTY_SETTINGS[currentDifficulty];
    const startSpeed = settings.startBallSpeed;
    
    if (side === 'left') {
        ballSpeedX = -startSpeed;
    } else {
        ballSpeedX = startSpeed;
    }
    
    const randomAngle = (Math.random() - 0.5) * 2;
    ballSpeedY = startSpeed * 0.6 * randomAngle;
    
    if (Math.abs(ballSpeedY) < startSpeed * 0.3) ballSpeedY = ballSpeedY > 0 ? startSpeed * 0.3 : -startSpeed * 0.3;
    if (Math.abs(ballSpeedY) > startSpeed) ballSpeedY = ballSpeedY > 0 ? startSpeed : -startSpeed;
}

function startGame() {
    if (autoTrainingActive) {
        stopAutoTraining();
    }
    gameStarted = true;
    gameRunning = true;
    autoMode = false;
    countdownValue = 3;
    
    if (countdownInterval) clearInterval(countdownInterval);
    countdownInterval = setInterval(() => {
        countdownValue--;
        if (countdownValue <= 0) {
            clearInterval(countdownInterval);
            countdownInterval = null;
        }
    }, 1000);
}

function pauseGame() {
    if (!gameStarted) return;
    gameRunning = !gameRunning;
    if (!gameRunning && countdownInterval) {
        clearInterval(countdownInterval);
        countdownInterval = null;
        countdownValue = 3;
    }
}

function resetFullGame() {
    gameStarted = false;
    gameRunning = true;
    countdownValue = 3;
    if (countdownInterval) {
        clearInterval(countdownInterval);
        countdownInterval = null;
    }
    leftScore = 0;
    rightScore = 0;
    ballX = canvas.width / 2;
    ballY = canvas.height / 2;
    ballSpeedX = 5;
    ballSpeedY = (Math.random() > 0.5 ? 4 : -4);
    leftPaddleY = (canvas.height - paddleHeight) / 2;
    rightPaddleY = (canvas.height - paddleHeight) / 2;
    paddleVelocity = 0;
    currentAction = 'stop';
}

setInterval(async () => {
    if (gameStarted && gameRunning && countdownValue <= 0) {
        await fetch('/save_model', { method: 'POST' });
        console.log('Model auto-saved');
    }
}, 30000);

async function gameLoop() {
    await updateAI();
    updateGame();
    draw();
    requestAnimationFrame(gameLoop);
}

gameLoop();

window.saveModel = async () => {
    try {
        const response = await fetch('/save_model', { method: 'POST' });
        const data = await response.json();
        console.log('Модель сохранена:', data);
        alert('💾 Модель сохранена!');
    } catch(e) {
        console.error('Ошибка сохранения:', e);
        alert('Ошибка сохранения модели');
    }
};

window.loadModel = async () => {
    try {
        const response = await fetch('/load_model', { method: 'POST' });
        const data = await response.json();
        console.log('Модель загружена:', data);
        if (data.status === 'loaded') {
            alert(`📂 Модель загружена! Состояний: ${data.size}, ε=${data.epsilon.toFixed(3)}`);
            document.getElementById('stats').innerHTML = data.size;
            document.getElementById('epsilon').innerHTML = data.epsilon.toFixed(3);
            setTimeout(() => location.reload(), 500);
        } else {
            alert('Модель не найдена. Сначала сохраните модель (💾)');
        }
    } catch(e) {
        console.error('Ошибка загрузки:', e);
        alert('Ошибка загрузки модели: ' + e.message);
    }
};

window.resetModel = async () => {
    if (confirm('Сбросить обучение ИИ? Это удалит все накопленные знания!')) {
        try {
            await fetch('/reset_model', { method: 'POST' });
            alert('🧠 Обучение сброшено! Страница обновится.');
            location.reload();
        } catch(e) {
            console.error('Ошибка сброса:', e);
            alert('Ошибка сброса');
        }
    }
};

window.startGame = startGame;
window.pauseGame = pauseGame;
window.resetFullGame = resetFullGame;
window.startAutoTraining = startAutoTraining;
window.stopAutoTraining = stopAutoTraining;