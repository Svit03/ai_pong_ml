from flask import Flask, render_template, request, jsonify
import json
import random
import joblib
import os

app = Flask(__name__)

ACTIONS = ['up', 'down', 'stop']
ACTION_TO_IDX = {'up': 0, 'down': 1, 'stop': 2}
IDX_TO_ACTION = {0: 'up', 1: 'down', 2: 'stop'}

q_table = {}

ALPHA = 0.1     
GAMMA = 0.9     
EPSILON = 0.7   
EPSILON_DECAY = 0.995
EPSILON_MIN = 0.05

last_state = None
last_action = None
last_ball_y = None
last_ball_speed_y = None

def get_state(ball_y, ball_speed_y, right_paddle_y, canvas_height=600, paddle_height=100):
    if ball_y < canvas_height / 3:
        ball_zone = 0
    elif ball_y > canvas_height * 2 / 3:
        ball_zone = 2
    else:
        ball_zone = 1
    
    speed_dir = 1 if ball_speed_y > 0 else 0
    
    paddle_center = right_paddle_y + paddle_height / 2
    if paddle_center < ball_y - 30:
        paddle_pos = 0 
    elif paddle_center > ball_y + 30:
        paddle_pos = 2  
    else:
        paddle_pos = 1 

    return f"{ball_zone}_{speed_dir}_{paddle_pos}"

def choose_action(state, epsilon=None):
    if epsilon is None:
        epsilon = EPSILON

    if random.random() < epsilon:
        return random.choice(ACTIONS)
    
    if state not in q_table:
        q_table[state] = [0.0, 0.0, 0.0]  
    
    best_idx = max(range(3), key=lambda i: q_table[state][i])
    return IDX_TO_ACTION[best_idx]

def calculate_reward(action, hit_paddle, goal_scored, is_my_goal, right_paddle_y, ball_y, paddle_height=100):
    reward = 0
    
    if hit_paddle:
        reward += 15
        print(f" Отскок! +15")
    
    if is_my_goal:
        reward -= 20
        print(f"  Гол пропущен! -20")
    
    if goal_scored:
        reward += 10
        print(f"  Гол забит! +10")
    
    paddle_center = right_paddle_y + paddle_height / 2
    distance_to_ball = abs(paddle_center - ball_y)
    
    if action == 'up' and paddle_center > ball_y:
        reward += 2  
        print(f"   Движение к мячу +2")
    elif action == 'down' and paddle_center < ball_y:
        reward += 2  
        print(f"    Движение к мячу +2")
    elif action == 'stop' and distance_to_ball < 20:
        reward += 3  
        print(f"    Точное позиционирование +3")
    elif action == 'stop' and distance_to_ball > 50:
        reward -= 1 
        print(f"    Бездействие далеко от мяча -1")
    
    return reward

def update_q_table(state, action, reward, next_state):
    
    action_idx = ACTION_TO_IDX[action]
    
    if state not in q_table:
        q_table[state] = [0.0, 0.0, 0.0]
    if next_state not in q_table:
        q_table[next_state] = [0.0, 0.0, 0.0]
    
    old_value = q_table[state][action_idx]
    
    future_max = max(q_table[next_state])
    
    new_value = old_value + ALPHA * (reward + GAMMA * future_max - old_value)
    
    q_table[state][action_idx] = new_value
    
    print(f"📚 Обучение: {state} -> {action} (награда: {reward}) | Новая ценность: {new_value:.2f}")

def decay_epsilon():
    global EPSILON
    EPSILON = max(EPSILON_MIN, EPSILON * EPSILON_DECAY)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/predict', methods=['POST'])
def predict():
    global last_state, last_action, last_ball_y, last_ball_speed_y, last_right_paddle_y
    
    data = request.json
    
    state = data['state']
    ball_y = data['ball_y']
    ball_speed_y = data['ball_speed_y']
    right_paddle_y = data['right_paddle_y']
    
    action = choose_action(state)
    
    last_state = state
    last_action = action
    last_ball_y = ball_y
    last_ball_speed_y = ball_speed_y
    last_right_paddle_y = right_paddle_y
    
    print(f"🎮 Состояние: {state} -> {action} (ε={EPSILON:.3f})")
    
    return jsonify({'action': action})

@app.route('/reward', methods=['POST'])
def reward():
    global last_state, last_action, EPSILON
    
    data = request.json
    hit_paddle = data.get('hit_paddle', False)
    goal_scored = data.get('goal_scored', False)
    is_my_goal = data.get('is_my_goal', False)
    next_ball_y = data['next_ball_y']
    next_ball_speed_y = data['next_ball_speed_y']
    next_right_paddle_y = data['next_right_paddle_y']
    
    if last_state and last_action:
        reward_value = calculate_reward(
            last_action, 
            hit_paddle, 
            goal_scored, 
            is_my_goal,
            last_right_paddle_y,
            last_ball_y
        )
        
        next_state = get_state(next_ball_y, next_ball_speed_y, next_right_paddle_y)
        update_q_table(last_state, last_action, reward_value, next_state)
        decay_epsilon()
        
        print(f"🏆 ИТОГО награда: {reward_value}\n")
    
    return jsonify({'status': 'ok'})

@app.route('/save_model', methods=['POST'])
def save_model():
    os.makedirs('models', exist_ok=True)
    data = {'q_table': q_table, 'epsilon': EPSILON}
    joblib.dump(data, 'models/qlearning_model.pkl')
    print(f"💾 Модель сохранена! Размер: {len(q_table)}")
    return jsonify({'status': 'saved', 'size': len(q_table)})

@app.route('/load_model', methods=['POST'])
def load_model():
    global q_table, EPSILON
    if os.path.exists('models/qlearning_model.pkl'):
        data = joblib.load('models/qlearning_model.pkl')
        q_table = data['q_table']
        EPSILON = data['epsilon']
        print(f"📂 Модель загружена! Размер: {len(q_table)}, ε={EPSILON:.3f}")
        return jsonify({'status': 'loaded', 'size': len(q_table)})
    return jsonify({'status': 'no model found'})

@app.route('/reset_model', methods=['POST'])
def reset_model():
    global q_table, EPSILON
    q_table = {}
    EPSILON = 0.7
    print("🔄 Модель сброшена!")
    return jsonify({'status': 'reset'})

@app.route('/stats', methods=['GET'])
def stats():
    return jsonify({
        'q_table_size': len(q_table),
        'epsilon': EPSILON
    })

if __name__ == '__main__':
    os.makedirs('models', exist_ok=True)
    app.run(debug=True)