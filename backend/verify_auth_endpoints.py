import json
import urllib.request
import urllib.error
import random
import sys

def run_tests():
    base_url = "http://127.0.0.1:8000"
    
    # Generate unique user
    rand_num = random.randint(1000, 9999)
    email = f"testuser_{rand_num}@example.com"
    fullname = "Test User Auth"
    password = "securepassword123"

    print("1. Testing Registration Endpoint...")
    reg_payload = json.dumps({
        "email": email,
        "full_name": fullname,
        "password": password
    }).encode()
    
    req = urllib.request.Request(f"{base_url}/auth/register", data=reg_payload, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            res = json.loads(response.read().decode())
            print("Registration Success:", res)
            assert res["email"] == email
            assert res["full_name"] == fullname
    except Exception as e:
        print("Registration Failed:", e)
        sys.exit(1)

    print("\n2. Testing Login Endpoint...")
    login_payload = json.dumps({
        "email": email,
        "password": password
    }).encode()
    
    req = urllib.request.Request(f"{base_url}/auth/login", data=login_payload, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            res = json.loads(response.read().decode())
            print("Login Success. Token Type:", res["token_type"])
            token = res["access_token"]
            assert token is not None
    except Exception as e:
        print("Login Failed:", e)
        sys.exit(1)

    print("\n3. Testing Profile (/auth/me) Endpoint...")
    req = urllib.request.Request(
        f"{base_url}/auth/me", 
        headers={"Authorization": f"Bearer {token}"}
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            res = json.loads(response.read().decode())
            print("Profile Retrieval Success:", res)
            assert res["email"] == email
            assert res["full_name"] == fullname
    except Exception as e:
        print("Profile Retrieval Failed:", e)
        sys.exit(1)

    print("\n4. Testing Route Guard (hitting secure /chat/ without token)...")
    req = urllib.request.Request(
        f"{base_url}/chat/",
        data=json.dumps({"message": "test"}).encode(),
        headers={"Content-Type": "application/json"}
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            print("FAILURE: Hitting secure path without token returned 200!")
            sys.exit(1)
    except urllib.error.HTTPError as e:
        print(f"Success: Route guard blocked request with Status Code: {e.code}")
        assert e.code == 401

    print("\n5. Testing Secure Route (hitting /chat/ with token)...")
    req = urllib.request.Request(
        f"{base_url}/chat/",
        data=json.dumps({"message": "Hello AI"}).encode(),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}"
        }
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as response:
            res = json.loads(response.read().decode())
            print("Secure chat success. AI replied:", res["reply"])
    except Exception as e:
        print("Secure chat failed:", e)
        sys.exit(1)

    print("\nALL AUTH INTEGRATION TESTS PASSED SUCCESSFULLY!")

if __name__ == "__main__":
    run_tests()
