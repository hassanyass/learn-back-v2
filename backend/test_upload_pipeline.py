"""
Verification test for the upload pipeline fixes.
Simulates the full flow: register, login, upload PDF, verify response, start session.
"""
import io
import os
import time
import requests

BASE = "http://127.0.0.1:8002"
ts = str(int(time.time()))
email = f"upload_test_{ts}@test.com"
username = f"uptest_{ts}"
password = "UploadTest123!"
results = []


def check(name, condition, detail=""):
    status = "PASS" if condition else "FAIL"
    results.append((status, name, detail))
    print(f"  [{status}] {name}" + (f" -- {detail}" if detail else ""))


print("=" * 65)
print("Upload Pipeline Verification Test")
print("=" * 65)

# 1. Auth setup
print("\n--- 1. Auth Setup ---")
r = requests.post(f"{BASE}/auth/register", json={"email": email, "username": username, "password": password})
check("Register", r.status_code == 200)
r2 = requests.post(f"{BASE}/auth/login", json={"email": email, "password": password})
check("Login", r2.status_code == 200)
token = r2.json().get("access_token", "")
check("Token received", bool(token))
headers = {"Authorization": f"Bearer {token}"}

# 2. Fix 5: File size guard
print("\n--- 2. Fix 5: File Size Guard ---")
large_content = b"%PDF-1.4 " + b"X" * (51 * 1024 * 1024)
r_large = requests.post(
    f"{BASE}/ingestion/upload-slides",
    headers=headers,
    files={"file": ("huge.pdf", io.BytesIO(large_content), "application/pdf")},
)
check("51 MB file -> HTTP 413", r_large.status_code == 413, str(r_large.status_code))

# 3. Corrupted file handling
print("\n--- 3. Corrupted File -> 422 (not 500) ---")
corrupt_bytes = b"NOTAPDF_CORRUPT_GARBAGE_BYTES_12345"
r_corrupt = requests.post(
    f"{BASE}/ingestion/upload-slides",
    headers=headers,
    files={"file": ("corrupt.pdf", io.BytesIO(corrupt_bytes), "application/pdf")},
)
check("Corrupted PDF -> not 500", r_corrupt.status_code in (400, 422), str(r_corrupt.status_code))

# 4. Valid PDF upload
print("\n--- 4. Fix 1: Valid PDF upload ---")
sample_pdf = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "frontend", "sample.pdf")
if os.path.exists(sample_pdf):
    with open(sample_pdf, "rb") as f:
        pdf_bytes = f.read()
    r_upload = requests.post(
        f"{BASE}/ingestion/upload-slides",
        headers=headers,
        files={"file": ("sample.pdf", io.BytesIO(pdf_bytes), "application/pdf")},
        timeout=120,
    )
    check("Upload -> HTTP 200", r_upload.status_code == 200, str(r_upload.status_code))
    if r_upload.status_code == 200:
        resp = r_upload.json()
        check("Has document_id", "document_id" in resp, str(resp.get("document_id")))
        check("document_id is int", isinstance(resp.get("document_id"), int))
        check("Has pdf_storage_url", "pdf_storage_url" in resp)
        check("Has segmentation", "segmentation" in resp)
        seg = resp.get("segmentation", {})
        check("Has source_file", "source_file" in seg)
        check("Has extracted_segments", "extracted_segments" in seg)
        segments = seg.get("extracted_segments", [])
        check("Max 4 topics", len(segments) <= 4, f"{len(segments)} topics")

        # 5. Session creation
        print("\n--- 5. Session Create from SlideDeck ---")
        r_sess = requests.post(f"{BASE}/session/create", headers=headers)
        check("Session create -> 200", r_sess.status_code == 200, str(r_sess.status_code))
        if r_sess.status_code == 200:
            sess = r_sess.json()
            check("Has session_id", "session_id" in sess, str(sess.get("session_id")))
            sess_id = sess.get("session_id")

            # 6. GET session
            print("\n--- 6. GET /session/{id} ---")
            r_get = requests.get(f"{BASE}/session/{sess_id}", headers=headers)
            check("GET session -> 200", r_get.status_code == 200)
            if r_get.status_code == 200:
                state = r_get.json()
                check("Has topics", len(state.get("topics", [])) > 0)
    elif r_upload.status_code == 422:
        print(f"  [INFO] Upload returned 422 (LLM issue): {r_upload.json().get('detail', '')[:100]}")
        print("  [INFO] Skipping session tests -- LLM not configured")
else:
    print(f"  [SKIP] sample.pdf not found at: {sample_pdf}")

# Summary
print("\n" + "=" * 65)
passed = sum(1 for r in results if r[0] == "PASS")
failed = sum(1 for r in results if r[0] == "FAIL")
for status, name, detail in results:
    marker = "+" if status == "PASS" else "X"
    print(f"  {marker} {name}")
print("=" * 65)
print(f"  PASSED: {passed}  |  FAILED: {failed}  |  TOTAL: {len(results)}")
print("=" * 65)
print("RESULT:", "ALL TESTS PASSED" if failed == 0 else f"{failed} FAILURE(S) DETECTED")
