const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const paddleWidth = 10;
const paddleHeight = 100;
const paddleSpeed = 6;

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
const ACTION_DELAY = 25;

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
    if (actionCooldown > 0) {
        actionCooldown--;
    } else {
        const newAction = await getAiAction();
        currentAction = newAction;
        actionCooldown = ACTION_DELAY;
    }

    let center = rightPaddleY + paddleHeight / 2;
    let diff = predictedY - center;

    const DEADZONE = 35;
    const MAX_SPEED = 8;
    const ACCELERATION = 0.5;
    const FRICTION = 0.8;

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

function draw() {
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.fillStyle = '#fff';
    ctx.font = '30px monospace';
    ctx.fillText(leftScore, canvas.width / 4, 50);
    ctx.fillText(rightScore, canvas.width * 3 / 4, 50);
    
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
        ballSpeedY += (Math.random() - 0.5) * 2;
        ballSpeedY = Math.max(-10, Math.min(10, ballSpeedY));
    }
    
    if (ballSpeedX > 0 && 
        newX + ballRadius > rightPaddleX && 
        newX - ballRadius < rightPaddleX + paddleWidth &&
        newY + ballRadius > rightPaddleY && 
        newY - ballRadius < rightPaddleY + paddleHeight) {
        
        newX = rightPaddleX - ballRadius;
        ballSpeedX = -ballSpeedX;
        hitPaddleThisFrame = true;
        ballSpeedY += (Math.random() - 0.5) * 2;
        ballSpeedY = Math.max(-10, Math.min(10, ballSpeedY));
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
    
    if (side === 'left') {
        ballSpeedX = -5;
    } else {
        ballSpeedX = 5;
    }
    
    const randomAngle = (Math.random() - 0.5) * 2;
    ballSpeedY = 3 * randomAngle;
    
    if (Math.abs(ballSpeedY) < 1.5) ballSpeedY = ballSpeedY > 0 ? 1.5 : -1.5;
    if (Math.abs(ballSpeedY) > 5) ballSpeedY = ballSpeedY > 0 ? 5 : -5;
}

setInterval(async () => {
    await fetch('/save_model', { method: 'POST' });
    console.log('Model auto-saved');
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