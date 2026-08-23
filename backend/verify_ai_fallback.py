import json
import urllib.request
import sys

def test_chat():
    print("Testing /chat/ endpoint...")
    payload = json.dumps({'message': 'Hello, can you help me with security?'}).encode()
    req = urllib.request.Request('http://127.0.0.1:8000/chat/', data=payload, headers={'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            status = response.status
            body = json.loads(response.read().decode())
            print(f"Status: {status}")
            print(f"Response: {json.dumps(body, indent=2)}")
            if "Offline Mode" in body.get("reply", "") or "fallback" in body.get("reply", "").lower():
                print("SUCCESS: Chat fallback activated correctly.")
            else:
                print("FAILURE: Chat response didn't contain fallback message.")
    except Exception as e:
        print(f"ERROR: {e}")
        sys.exit(1)

def test_review():
    print("\nTesting /review/ endpoint...")
    code = """def parse_data(user_input):
    # Dynamic exec is highly dangerous
    exec(user_input)
    
    # Hardcoded credential
    api_key = "abc-123-secret-token"
    
    return True
"""
    payload = json.dumps({'code': code, 'language': 'python'}).encode()
    req = urllib.request.Request('http://127.0.0.1:8000/review/', data=payload, headers={'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            status = response.status
            body = json.loads(response.read().decode())
            print(f"Status: {status}")
            print(f"Response: {json.dumps(body, indent=2)}")
            issues = body.get("issues", [])
            score = body.get("score", 100)
            print(f"Detected {len(issues)} issues. Score: {score}")
            
            # We expect Code Smell (exec) and Security Risk (hardcoded secret)
            has_smell = any("exec" in issue.get("message", "").lower() for issue in issues)
            has_secret = any("secret" in issue.get("message", "").lower() for issue in issues)
            
            if has_smell and has_secret:
                print("SUCCESS: Both code smell (exec) and hardcoded secret issues were correctly identified by fallback rules.")
            else:
                print(f"FAILURE: Expected issues not found. Code smell detected? {has_smell}. Secret detected? {has_secret}.")
    except Exception as e:
        print(f"ERROR: {e}")
        sys.exit(1)

if __name__ == "__main__":
    test_chat()
    test_review()
