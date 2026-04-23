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

let lastHitPaddle = false;
let lastGoalScored = false;
let lastIsMyGoal = false;

canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    leftPaddleY = e.clientY - rect.top - paddleHeight / 2;
    if (leftPaddleY < 0) leftPaddleY = 0;
    if (leftPaddleY > canvas.height - paddleHeight) leftPaddleY = canvas.height - paddleHeight;
});

async function getAiAction() {
    const response = await fetch('/predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            ball_y: ballY,
            ball_speed_y: ballSpeedY,
            right_paddle_y: rightPaddleY
        })
    });
    const data = await response.json();
    return data.action;
}

async function updateAI() {
    const action = await getAiAction();
    
    if (action === 'up') {
        rightPaddleY -= paddleSpeed;
    } else if (action === 'down') {
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
    
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(ballX, ballY, ballRadius, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.fillStyle = '#0f0';
    ctx.fillRect(20, leftPaddleY, paddleWidth, paddleHeight);
    ctx.fillRect(canvas.width - 30, rightPaddleY, paddleWidth, paddleHeight);
}

let previousBallY = ballY;
let previousBallSpeedY = ballSpeedY;
let previousRightPaddleY = rightPaddleY;
let hitPaddleThisFrame = false;

function updateGame() {
    previousBallY = ballY;
    previousBallSpeedY = ballSpeedY;
    previousRightPaddleY = rightPaddleY;
    
    ballX += ballSpeedX;
    ballY += ballSpeedY;
    
    if (ballY + ballRadius > canvas.height || ballY - ballRadius < 0) {
        ballSpeedY = -ballSpeedY;
    }
    
    if (ballX - ballRadius < 30 && 
        ballY > leftPaddleY && 
        ballY < leftPaddleY + paddleHeight) {
        ballSpeedX = -ballSpeedX;
        ballSpeedY += (Math.random() - 0.5) * 2;
        ballSpeedY = Math.max(-8, Math.min(8, ballSpeedY));
    }
    
    if (ballX + ballRadius > canvas.width - 30 && 
        ballY > rightPaddleY && 
        ballY < rightPaddleY + paddleHeight) {
        ballSpeedX = -ballSpeedX;
        hitPaddleThisFrame = true;
        ballSpeedY += (Math.random() - 0.5) * 2;
        ballSpeedY = Math.max(-8, Math.min(8, ballSpeedY));
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
    } else {
        sendReward(false, false, false);
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