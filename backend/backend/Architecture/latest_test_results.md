# Latest E2E Test Results

- Run Timestamp (UTC): `2026-04-21T11:26:37.425853+00:00`
- Base URL: `http://localhost:8000`
- Passed: `1`
- Failed: `3`

## Step Results

### Step 1 (Auth): Register + Login — PASS
- HTTP/WS Status: `200`
- Duration: `10764.86 ms`
- Request Payload:
```json
{
  "register": {
    "email": "e2e_ohqvm7jz@learnbackqa.com",
    "username": "e2e_ohqvm7jz",
    "password": "SecurePass123!"
  },
  "login": {
    "email": "e2e_ohqvm7jz@learnbackqa.com",
    "password": "SecurePass123!"
  }
}
```
- Response Payload:
```json
{
  "register_status": 200,
  "register_body": {
    "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI1IiwiaWF0IjoxNzc2NzcwNzg3LCJleHAiOjE3NzY3NzQzODd9.IXwKvdHBrwArO-fBxfjtgTGqIzY28YKZmv6CDf_S2IM",
    "token_type": "bearer"
  },
  "login_status": 200,
  "login_body": {
    "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI1IiwiaWF0IjoxNzc2NzcwNzk2LCJleHAiOjE3NzY3NzQzOTZ9.dDRx8w-npQlwwPEfIeSW5QgSHZ8NxnFeHyB7Jq1gmZg",
    "token_type": "bearer"
  }
}
```

### Step 2 (Dashboard): GET dashboard — FAIL
- HTTP/WS Status: `500`
- Duration: `642.38 ms`
- Notes: Dashboard response missing expected streak/milestone fields or non-200 status.
- Request Payload:
```json
{
  "headers": {
    "Authorization": "Bearer <token>"
  }
}
```
- Response Payload:
```json
"Internal Server Error"
```

### Step 3 (Ingestion): Upload slides — FAIL
- HTTP/WS Status: `None`
- Duration: `90.13 ms`
- Notes: Exception: 
- Request Payload:
```json
null
```
- Response Payload:
```json
null
```

### Step 4 (Session WebSocket): Send 'Hello Kido' — FAIL
- HTTP/WS Status: `None`
- Duration: `0.0 ms`
- Notes: No session_id found from ingestion response; cannot open session websocket.
- Request Payload:
```json
null
```
- Response Payload:
```json
null
```
