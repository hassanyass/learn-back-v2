"""End-to-end integration test simulating the full frontend auth flow."""
import requests
import json
import time

BASE = "http://127.0.0.1:8002"
ts = str(int(time.time()))
email = f"e2e_{ts}@test.com"
username = f"e2e_{ts}"
password = "E2EPass123!"
results = []

print("=" * 60)
print("E2E Auth Integration Test")
print("=" * 60)

# 1. Register
print("\n--- 1. POST /auth/register ---")
r1 = requests.post(f"{BASE}/auth/register", json={"email": email, "username": username, "password": password})
d1 = r1.json()
print(f"  Status: {r1.status_code} (expect 200)")
print(f"  Has access_token: {'access_token' in d1}")
results.append(("Register", r1.status_code == 200))

# 2. Login
print("\n--- 2. POST /auth/login ---")
r2 = requests.post(f"{BASE}/auth/login", json={"email": email, "password": password})
d2 = r2.json()
token = d2.get("access_token", "")
print(f"  Status: {r2.status_code} (expect 200)")
print(f"  Has access_token: {bool(token)}")
results.append(("Login", r2.status_code == 200))

# 3. GET /auth/me (simulates auth.js apiGet after login)
print("\n--- 3. GET /auth/me ---")
r3 = requests.get(f"{BASE}/auth/me", headers={"Authorization": f"Bearer {token}"})
d3 = r3.json()
print(f"  Status: {r3.status_code} (expect 200)")
print(f"  user_id: {d3.get('user_id')}")
print(f"  username: {d3.get('username')}")
print(f"  has_seen_walkthrough: {d3.get('has_seen_walkthrough')}")
results.append(("GET /auth/me", r3.status_code == 200 and d3.get("user_id") is not None))

# 4. GET /dashboard (simulates dashboard.js loadDashboardState)
print("\n--- 4. GET /dashboard ---")
r4 = requests.get(f"{BASE}/dashboard", headers={"Authorization": f"Bearer {token}"})
d4 = r4.json()
print(f"  Status: {r4.status_code} (expect 200)")
print(f"  total_time_hours: {d4.get('total_time_hours')}")
print(f"  current_streak_days: {d4.get('current_streak_days')}")
print(f"  Has categorized_sessions: {'categorized_sessions' in d4}")
results.append(("GET /dashboard", r4.status_code == 200 and "total_time_hours" in d4))

# 5. PATCH /auth/onboarding_complete (simulates dashboard.js "Got it!" button)
print("\n--- 5. PATCH /auth/onboarding_complete ---")
r5 = requests.patch(f"{BASE}/auth/onboarding_complete", headers={"Authorization": f"Bearer {token}"})
d5 = r5.json()
print(f"  Status: {r5.status_code} (expect 200)")
print(f"  has_seen_walkthrough: {d5.get('has_seen_walkthrough')}")
results.append(("PATCH onboarding", r5.status_code == 200 and d5.get("has_seen_walkthrough") is True))

# 6. Verify onboarding persisted
print("\n--- 6. GET /auth/me (verify persistence) ---")
r6 = requests.get(f"{BASE}/auth/me", headers={"Authorization": f"Bearer {token}"})
d6 = r6.json()
print(f"  Status: {r6.status_code} (expect 200)")
print(f"  has_seen_walkthrough: {d6.get('has_seen_walkthrough')}")
results.append(("Verify onboarding", r6.status_code == 200 and d6.get("has_seen_walkthrough") is True))

# Summary
print("\n" + "=" * 60)
all_passed = all(r[1] for r in results)
for name, passed in results:
    print(f"  {'PASS' if passed else 'FAIL'} - {name}")
print("=" * 60)
print(f"RESULT: {'ALL TESTS PASSED' if all_passed else 'FAILURES DETECTED'}")
