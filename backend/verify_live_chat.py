import json
import random
import urllib.request

BASE_URL = 'http://127.0.0.1:8000'

rand = random.randint(10000, 99999)
email = f'livechat_{rand}@example.com'
password = 'securepassword123'

register_payload = json.dumps({
    'email': email,
    'full_name': 'Live Chat User',
    'password': password,
}).encode()

req = urllib.request.Request(
    f'{BASE_URL}/auth/register',
    data=register_payload,
    headers={'Content-Type': 'application/json'},
)
with urllib.request.urlopen(req, timeout=20) as res:
    print('register:', res.status)

login_payload = json.dumps({'email': email, 'password': password}).encode()
req = urllib.request.Request(
    f'{BASE_URL}/auth/login',
    data=login_payload,
    headers={'Content-Type': 'application/json'},
)
with urllib.request.urlopen(req, timeout=20) as res:
    token = json.loads(res.read().decode())['access_token']
    print('login:', res.status)

chat_payload = json.dumps({'message': 'Explain SQL injection risk in 2 lines.'}).encode()
req = urllib.request.Request(
    f'{BASE_URL}/chat/',
    data=chat_payload,
    headers={'Content-Type': 'application/json', 'Authorization': f'Bearer {token}'},
)
with urllib.request.urlopen(req, timeout=120) as res:
    data = json.loads(res.read().decode())
    print('chat:', res.status)
    print('reply:', data.get('reply', ''))
