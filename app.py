from flask import Flask, render_template, request, jsonify
import json
import random
import joblib
import os

app = Flask(__name__)

ACTION = ['up', 'down', 'stop']
ACTION_TO_IDX = {'up': 0, 'down': 1, 'stop': 2}
IDX_TO_ACTION = {0: 'up', 1: 'down', 2: 'stop'}

q_table = {}

ALPHA = 0.1
GAMMA = 0.9
EPSILON = 0.7

last_state = None
last_action = None

def get_state(ball_y, ball_speed_y, canvas_height=600):
    if ball_y < canvas_height / 3:
        ball_zone = 'top'
    elif ball_y > canvas_height * 2 / 3:
        ball_zone = 'bottom'
    else:
        ball_zone = 'center'

    speed_dir = 'down' if ball_speed_y > 0 else 'up'

    return f"{ball_zone}_{speed_dir}"

def choose_action(state, epsilon=EPSILON):
    if random.random() < epsilon:
        return random.choice(ACTION)
    if state not in q_table:
        q_table[state] = [0.0, 0.0, 0.0]
    
    best_idx = max(range(3), key=lambda i: q_table[state][i])
    return IDX_TO_ACTION[best_idx]

def update_q_table(state, action, reward, next_state):
    if state not in q_table:
        q_table[state] = [0.0, 0.0, 0.0]
    if next_state not in q_table:
        q_table[next_state] = [0.0, 0.0, 0.0]

    old_value = q_table[state][action_idx]
    
    future_max = max(q_table[next_state])
    
    new_value = old_value + ALPHA * (reward + GAMMA * future_max - old_value)

    q_table[state][action_idx] = new_value

    print(f"Обучение: {state} -> {action} (награда: {reward}) | Новая ценность: {new_value:.2f} ")

current_state = None
choose_action = None

@app.route('/')
def index():
    """Главная страница"""
    return render_template('index.html')

@app.rote('/predict', methods=['POST'])
def predict():
    global current_state, choose_action

    data = request.json

    ball_y = data['ball_y']
    ball_speed_y = data['ball_speed_y']

    state = get_state(ball_y, ball_speed_y)

    action = choose_action(state)

    current_state = state

    current_state = state
    current_state = action

    print(f"Состояние: {state} -> Действие: {action}")

    return jsonify({'action'}: action)

@app.rote('/reward', methods=['POST'])
def reward():
    global current_state, current_action

    date = request.json
    reward = data['reward']

    if current_state and choose_action:
        next_state = current_state

        update_q_table(current_state, current_action, reward, next_state)

        print(f"Получена награда: {reward}")
    
    return jsonify({'status: ok'})

@app.rote('/save_model', methods=['POST'])
def save_model():
    """Сохраняет q-таблицу в файл"""
    joblib.dumps(q_table, 'models/q_table.pkl')
    return jsonify({'status': 'saved'})

@app.rote('/load_model', methods=['POST'])
def load_model():
    """Загружает q-таблицу из файла"""
    global q_table
    if os.path.exists('models/q_table.pkl'):
        q_table = joblib.load('models/q_table.pkl')
        return jsonify({'status': 'loaded', 'size': len(q_table)})
    return jsonify({'status': 'no model found'})

if __name__ == '__main__':

    os.makedirs('models', exists_ok=True)
    app.run(debug=True)


