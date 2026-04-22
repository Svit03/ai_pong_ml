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

last_state = None
last_action = None
current_state = None
current_action = None

def get_state(ball_y, ball_speed_y, canvas_height=600):
    """
    Превращает непрерывные координаты в дискретное состояние.
    Состояние = позиция мяча (верх/центр/низ) + направление скорости (вверх/вниз)
    """
    if ball_y < canvas_height / 3:
        ball_zone = 'top'
    elif ball_y > canvas_height * 2 / 3:
        ball_zone = 'bottom'
    else:
        ball_zone = 'center'
    
    speed_dir = 'down' if ball_speed_y > 0 else 'up'
    
    return f"{ball_zone}_{speed_dir}"

def choose_action(state, epsilon=EPSILON):
    """
    Выбирает действие: случайное (exploration) или лучшее по Q-таблице (exploitation)
    """
    if random.random() < epsilon:
        return random.choice(ACTIONS)
    
    if state not in q_table:
        q_table[state] = [0.0, 0.0, 0.0]  
    
    best_idx = max(range(3), key=lambda i: q_table[state][i])
    return IDX_TO_ACTION[best_idx]

def update_q_table(state, action, reward, next_state):
    """
    Обновляет Q-таблицу по формуле Q-learning:
    Q(s,a) = Q(s,a) + α * (reward + γ * max(Q(s')) - Q(s,a))
    """
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

@app.route('/')
def index():
    """Главная страница"""
    return render_template('index.html')

@app.route('/predict', methods=['POST'])
def predict():
    """
    Принимает данные от JS, возвращает действие для ИИ
    """
    global current_state, current_action
    
    data = request.json
    
    ball_y = data['ball_y']
    ball_speed_y = data['ball_speed_y']
    
    state = get_state(ball_y, ball_speed_y)
    
    action = choose_action(state)
    
    current_state = state
    current_action = action
    
    print(f"🎮 Состояние: {state} -> Действие: {action}")
    
    return jsonify({'action': action})

@app.route('/reward', methods=['POST'])
def reward():
    """
    Получает награду от JS и обновляет Q-таблицу
    """
    global current_state, current_action
    
    data = request.json
    reward = data['reward']
    
    if current_state and current_action:
        next_state = current_state
        
        update_q_table(current_state, current_action, reward, next_state)
        
        print(f"🏆 Получена награда: {reward}")
    
    return jsonify({'status': 'ok'})

@app.route('/save_model', methods=['POST'])
def save_model():
    """Сохраняет Q-таблицу в файл"""
    os.makedirs('models', exist_ok=True)
    joblib.dump(q_table, 'models/q_table.pkl')
    return jsonify({'status': 'saved'})

@app.route('/load_model', methods=['POST'])
def load_model():
    """Загружает Q-таблицу из файла"""
    global q_table
    if os.path.exists('models/q_table.pkl'):
        q_table = joblib.load('models/q_table.pkl')
        return jsonify({'status': 'loaded', 'size': len(q_table)})
    return jsonify({'status': 'no model found'})

if __name__ == '__main__':
    os.makedirs('models', exist_ok=True)
    app.run(debug=True)