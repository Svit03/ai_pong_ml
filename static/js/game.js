const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const paddleWidth = 10;
const paddleHeight = 100;
const paddleSpeed = 8;

let ballX = canvas.width / 2;
let ballY = canvas.height / 2;
let ballSpeedX = 5;
let ballSpeedY = 4;
let ballRadius = 10;

let leftPaddleY = (canvas.height - paddleHeight) / 2;
let rightPaddleY = (canvas.height - paddleHeight) / 2;

let leftScore = 0;
let rightScore = 0;

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
            ball_speed_y: ballSpeedY
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

    ctx.fillStyle = '#0f0';
    ctx.fillRect(canvas.width - 30, rightPaddleY, paddleWidth, paddleHeight);
}

let previousBallY = ballY;
let previousBallSpeedY = ballSpeedY;
let pendingReward = null;

function updateGame() {
    previousBallY = ballY;
    previousBallSpeedY = ballSpeedY;
    
    ballX += ballSpeedX;
    ballY += ballSpeedY;
    
    if (ballY + ballRadius > canvas.height || ballY - ballRadius < 0) {
        ballSpeedY = -ballSpeedY;
    }
    
    if (ballX - ballRadius < 30 && 
        ballY > leftPaddleY && 
        ballY < leftPaddleY + paddleHeight) {
        ballSpeedX = -ballSpeedX;
    }
    
    if (ballX + ballRadius > canvas.width - 30 && 
        ballY > rightPaddleY && 
        ballY < rightPaddleY + paddleHeight) {
        ballSpeedX = -ballSpeedX;
        sendReward(5, ballY, ballSpeedY);
    }
    
    if (ballX + ballRadius < 0) {
        rightScore++;
        resetBall('right');
        sendReward(-10, ballY, ballSpeedY);
    }
    
    if (ballX - ballRadius > canvas.width) {
        leftScore++;
        resetBall('left');
        sendReward(10, ballY, ballSpeedY);
    }
}

async function sendReward(reward, nextBallY, nextBallSpeedY) {
    await fetch('/reward', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            reward: reward,
            next_ball_y: nextBallY,
            next_ball_speed_y: nextBallSpeedY
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
    
    ballSpeedY = (Math.random() > 0.5 ? 4 : -4);
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