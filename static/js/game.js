const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const paddleWidth = 10;
const paddleHeight = 100;
const paddleSpeed = 8;

let ballX = canvas.width / 2;
let ballY = canvas.height / 2;
let ballSpeedX = 5;
let ballSpeedY = (Math.random() > 0.5 ? 4 : -4);
let ballRadius = 10;

let leftPaddleY = (canvas.height - paddleHeight) / 2;
let rightPaddleY = (canvas.height - paddleHeight) / 2;

let leftScore = 0;
let rightScore = 0;

function predictBallPosition(framesAhead = 15) {
    let futureX = ballX + ballSpeedX * framesAhead;
    let futureY = ballY + ballSpeedY * framesAhead;
    
    for (let i = 0; i < framesAhead; i++) {
        if (futureY + ballRadius > canvas.height) {
            futureY = canvas.height - ballRadius - (futureY + ballRadius - canvas.height);
        }
        if (futureY - ballRadius < 0) {
            futureY = ballRadius + (0 - (futureY - ballRadius));
        }
    }
    
    return { x: futureX, y: futureY };
}

function getStateFromPrediction() {
    const prediction = predictBallPosition(12); 
    
    let predictedZone;
    if (prediction.y < canvas.height / 3) predictedZone = 0;
    else if (prediction.y > canvas.height * 2 / 3) predictedZone = 2;
    else predictedZone = 1;
    
    const speedDir = ballSpeedY > 0 ? 1 : 0;
    
    const paddleCenter = rightPaddleY + paddleHeight / 2;
    let relativePos;
    if (paddleCenter < prediction.y - 20) relativePos = 0;      
    else if (paddleCenter > prediction.y + 20) relativePos = 2; 
    else relativePos = 1;                                       
    
    return `${predictedZone}_${speedDir}_${relativePos}`;
}

function checkPaddleCollision(ballX, ballY, paddleX, paddleY, paddleWidth, paddleHeight, ballRadius) {
    const closestX = Math.max(paddleX, Math.min(ballX, paddleX + paddleWidth));
    const closestY = Math.max(paddleY, Math.min(ballY, paddleY + paddleHeight));
    const dx = ballX - closestX;
    const dy = ballY - closestY;
    return Math.sqrt(dx * dx + dy * dy) < ballRadius;
}

canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    leftPaddleY = e.clientY - rect.top - paddleHeight / 2;
    if (leftPaddleY < 0) leftPaddleY = 0;
    if (leftPaddleY > canvas.height - paddleHeight) leftPaddleY = canvas.height - paddleHeight;
});

async function getAiAction() {
    const state = getStateFromPrediction();
    
    const response = await fetch('/predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            state: state,  
            ball_y: ballY,
            ball_speed_y: ballSpeedY,
            right_paddle_y: rightPaddleY
        })
    });
    const data = await response.json();
    return data.action;
}

let currentAction = 'stop';
let actionCooldown = 0;
const ACTION_DELAY = 12;  

async function updateAI() {
    if (actionCooldown > 0) {
        actionCooldown--;
    } else {
        const newAction = await getAiAction();
        currentAction = newAction;
        actionCooldown = ACTION_DELAY;
    }
    
    if (currentAction === 'up') {
        rightPaddleY -= paddleSpeed;
    } else if (currentAction === 'down') {
        rightPaddleY += paddleSpeed;
    }
    
    if (rightPaddleY < 0) rightPaddleY = 0;
    if (rightPaddleY > canvas.height - paddleHeight) rightPaddleY = canvas.height - paddleHeight;
}

function draw() {
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.fillStyle = '#fff';
    ctx.font = '30px monospace';
    ctx.fillText(leftScore, canvas.width / 4, 50);
    ctx.fillText(rightScore, canvas.width * 3 / 4, 50);
    
    const prediction = predictBallPosition(12);
    ctx.fillStyle = '#ff4444';
    ctx.beginPath();
    ctx.arc(prediction.x, prediction.y, 5, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.font = '12px monospace';
    ctx.fillStyle = '#888';
    ctx.fillText(`AI: ${currentAction}`, canvas.width - 80, 30);
    ctx.fillText(`Pred Y: ${Math.round(prediction.y)}`, canvas.width - 80, 50);
    
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
    if (checkPaddleCollision(ballX, ballY, leftPaddleX, leftPaddleY, paddleWidth, paddleHeight, ballRadius)) {
        if (ballSpeedX < 0) {
            ballX = leftPaddleX + paddleWidth + ballRadius;
            ballSpeedX = -ballSpeedX;
            ballSpeedY += (Math.random() - 0.5) * 3;
            ballSpeedY = Math.max(-8, Math.min(8, ballSpeedY));
        }
    }
    
    const rightPaddleX = canvas.width - 30;
    let hitPaddle = false;
    
    if (checkPaddleCollision(ballX, ballY, rightPaddleX, rightPaddleY, paddleWidth, paddleHeight, ballRadius)) {
        if (ballSpeedX > 0) {
            ballX = rightPaddleX - ballRadius;
            ballSpeedX = -ballSpeedX;
            hitPaddle = true;
            hitPaddleThisFrame = true;
            ballSpeedY += (Math.random() - 0.5) * 3;
            ballSpeedY = Math.max(-8, Math.min(8, ballSpeedY));
        }
    }
    
    if (ballX + ballRadius < 0) {
        rightScore++;
        sendReward(false, true, true);
        resetBall('right');
        hitPaddleThisFrame = false;
    } else if (ballX - ballRadius > canvas.width) {
        leftScore++;
        sendReward(true, false, false);
        resetBall('left');
        hitPaddleThisFrame = false;
    } else if (hitPaddleThisFrame) {
        sendReward(true, false, false);
        hitPaddleThisFrame = false;
    }
}

async function sendReward(hit, goalForAI, goalForPlayer) {
    await fetch('/reward', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            hit_paddle: hit,
            goal_scored: goalForPlayer,
            is_my_goal: goalForAI,
            next_ball_y: ballY,
            next_ball_speed_y: ballSpeedY,
            next_right_paddle_y: rightPaddleY
        })
    });
}

function resetBall(side) {
    ballX = canvas.width / 2;
    ballY = canvas.height / 2;
    
    if (side === 'left') {
        ballSpeedX = -5;
    } else {
        ballSpeedX = 5;
    }
    
    ballSpeedY = (Math.random() > 0.5 ? 4 : -4) + (Math.random() - 0.5) * 2;
    ballSpeedY = Math.max(-6, Math.min(6, ballSpeedY));
}

setInterval(async () => {
    await fetch('/save_model', { method: 'POST' });
    console.log('💾 Модель автосохранена');
}, 30000);

async function gameLoop() {
    await updateAI();
    updateGame();
    draw();
    requestAnimationFrame(gameLoop);
}

gameLoop();

window.saveModel = () => fetch('/save_model', { method: 'POST' });
window.loadModel = () => fetch('/load_model', { method: 'POST' });
window.resetModel = () => fetch('/reset_model', { method: 'POST' });