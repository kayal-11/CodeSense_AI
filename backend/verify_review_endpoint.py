import json
import random
import urllib.request
import urllib.error

BASE_URL = 'http://127.0.0.1:8000'

rand_num = random.randint(1000, 9999)
email = f'reviewuser_{rand_num}@example.com'
password = 'securepassword123'

# Register
reg_payload = json.dumps({
    'email': email,
    'full_name': 'Review User',
    'password': password,
}).encode()
req = urllib.request.Request(f'{BASE_URL}/auth/register', data=reg_payload, headers={'Content-Type': 'application/json'})
with urllib.request.urlopen(req, timeout=20) as response:
    print('register:', response.status)

# Login
login_payload = json.dumps({'email': email, 'password': password}).encode()
req = urllib.request.Request(f'{BASE_URL}/auth/login', data=login_payload, headers={'Content-Type': 'application/json'})
with urllib.request.urlopen(req, timeout=20) as response:
    token = json.loads(response.read().decode())['access_token']
    print('login:', response.status)

# Review
review_payload = json.dumps({'code': 'def x():\n    return 1', 'language': 'python'}).encode()
req = urllib.request.Request(
    f'{BASE_URL}/review/',
    data=review_payload,
    headers={
        'Content-Type': 'application/json',
        'Authorization': f'Bearer {token}',
    },
)
try:
    with urllib.request.urlopen(req, timeout=180) as response:
        body = json.loads(response.read().decode())
        print('review:', response.status)
        print('summary:', body.get('summary', ''))
        print('score:', body.get('score', body.get('overall_score')))
except urllib.error.HTTPError as e:
    print('review failed status:', e.code)
    print('review failed body:', e.read().decode())
    raise
