import json
import urllib.request

req = urllib.request.Request('http://127.0.0.1:8000/health')
with urllib.request.urlopen(req, timeout=10) as response:
    print(response.status)
    print(response.read().decode())

payload = json.dumps({'code': 'def test():\n    return 1', 'language': 'python'}).encode()
request = urllib.request.Request('http://127.0.0.1:8000/review/', data=payload, headers={'Content-Type': 'application/json'})
with urllib.request.urlopen(request, timeout=10) as response:
    print(response.status)
    print(response.read().decode())
