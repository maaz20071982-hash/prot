"""
THERMOSENSE End-to-End Smoke Test Suite (backend/e2e_smoke.py)
-------------------------------------------------------------
Uses Playwright to test real UI login, dashboard routing, and navigation
for all four core roles:
1. Worker (Alex Morgan)
2. Supervisor (Marcus Vance)
3. Safety Officer (Dr. Elena Rostova)
4. Administrator (Arthur Pendelton)
"""

import os
import sys
import time
import subprocess
import urllib.request
from typing import Dict, Any, List

# Ensure project root is in sys.path
_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if _root not in sys.path:
    sys.path.insert(0, _root)

from backend.db import seed_db

try:
    from playwright.sync_api import sync_playwright, expect
except ImportError:
    sync_playwright = None

BASE_URL = os.environ.get("BASE_URL", "http://127.0.0.1:8000")


def ensure_server():
    """Ensures backend uvicorn server is up and responsive before running Playwright."""
    try:
        with urllib.request.urlopen(f"{BASE_URL}/api/config", timeout=2) as resp:
            if resp.status == 200:
                print(f"Backend server is already running on {BASE_URL}")
                return None
    except Exception:
        pass

    print(f"Starting background uvicorn server on {BASE_URL}...")
    proc = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "backend.main:app", "--host", "127.0.0.1", "--port", "8000"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL
    )
    for i in range(20):
        time.sleep(1)
        try:
            with urllib.request.urlopen(f"{BASE_URL}/api/config", timeout=1) as resp:
                if resp.status == 200:
                    print(f"Uvicorn server is up and responsive after {i+1}s.")
                    return proc
        except Exception:
            pass
    print("Warning: Could not verify server readiness; proceeding...")
    return proc


def run_e2e_smoke():
    if not sync_playwright:
        print("[FAIL] Playwright is not installed.")
        return {"error": "Playwright is not installed"}

    server_proc = ensure_server()

    try:
        print(f"--- Seeding Fresh Database ---")
        seed_db()
        print("Database seeded successfully.")

        results = {}
        
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            context = browser.new_context(viewport={"width": 1280, "height": 800})
            page = context.new_page()

            # Define roles to test
            roles_to_test = [
                {
                    "role": "worker",
                    "username": "worker1",
                    "password": "password123",
                    "expected_path": "/worker",
                    "expected_dashboard_text": "Alex Morgan",
                    "expected_nav": ["Worker Safety"],
                    "prohibited_nav": ["Command Centre", "Safety & Compliance", "Predictive Modeling", "Workforce Analytics", "Administration"]
                },
                {
                    "role": "supervisor",
                    "username": "supervisor",
                    "password": "password123",
                    "expected_path": "/command",
                    "expected_dashboard_text": "Command Centre",
                    "expected_nav": ["Command Centre", "Safety & Compliance", "Incidents Registry"],
                    "prohibited_nav": ["Predictive Modeling", "Workforce Analytics", "Innovation Lab", "Administration"]
                },
                {
                    "role": "safety_officer",
                    "username": "safety_officer",
                    "password": "password123",
                    "expected_path": "/command",
                    "expected_dashboard_text": "Command Centre",
                    "expected_nav": ["Command Centre", "Safety & Compliance", "Predictive Modeling", "Incidents Registry", "Workforce Analytics", "Innovation Lab"],
                    "prohibited_nav": ["Administration"]
                },
                {
                    "role": "admin",
                    "username": "admin",
                    "password": "admin123",
                    "expected_path": "/admin",
                    "expected_dashboard_text": "Administration",
                    "expected_nav": ["Administration"],
                    "prohibited_nav": []
                }
            ]

            for item in roles_to_test:
                role = item["role"]
                username = item["username"]
                password = item["password"]
                print(f"\n[E2E] Testing role: {role} ({username})...")

                page.on("pageerror", lambda err: print(f"  [PAGE ERROR in {role}]: {err}"))

                try:
                    # 1. Clear session and cookies to ensure clean login state
                    context.clear_cookies()
                    page.goto(f"{BASE_URL}/auth")
                    page.evaluate("() => { localStorage.clear(); sessionStorage.clear(); }")
                    page.goto(f"{BASE_URL}/auth")
                    page.wait_for_load_state("networkidle")

                    # Wait for username input
                    user_input = page.locator('input[placeholder*="supervisor"], input[type="text"]').first
                    user_input.wait_for(state="visible", timeout=10000)
                    user_input.fill(username)

                    # Password input
                    pass_input = page.locator('input[type="password"]').first
                    pass_input.fill(password)

                    # Click Sign In submit button
                    sign_in_btn = page.locator('button[type="submit"]:has-text("Sign In to Platform"), button[type="submit"]').first
                    sign_in_btn.click()

                    # Wait for navigation / response
                    page.wait_for_timeout(2000)
                    current_url = page.url
                    page_content = page.content()

                    # Check if error message is displayed
                    error_elem = page.locator('.text-red-200, [role="alert"]').first
                    err_text = error_elem.text_content() if error_elem.is_visible() else None

                    # Nav items check
                    nav_buttons = page.locator('nav button, header button').all_text_contents()
                    nav_text = " ".join(nav_buttons)

                    print(f"  Current URL: {current_url}")
                    if err_text:
                        print(f"  Login Error visible: {err_text}")

                    # Assert URL
                    passed = True
                    failure_reasons = []

                    if item["expected_path"] not in current_url:
                        passed = False
                        failure_reasons.append(f"Expected URL path '{item['expected_path']}', got '{current_url}'")

                    if item["expected_dashboard_text"] not in page_content:
                        passed = False
                        failure_reasons.append(f"Expected dashboard text '{item['expected_dashboard_text']}' not found on page")

                    for req_nav in item.get("expected_nav", []):
                        if req_nav not in nav_text and req_nav not in page_content:
                            passed = False
                            failure_reasons.append(f"Missing expected nav '{req_nav}'")

                    for proh_nav in item.get("prohibited_nav", []):
                        if proh_nav in nav_text:
                            passed = False
                            failure_reasons.append(f"Prohibited nav item '{proh_nav}' is visible to role '{role}'")

                    if passed:
                        print(f"  [PASS] Role '{role}' logged in successfully, reached {current_url}")
                        results[role] = {"status": "PASS", "url": current_url}
                    else:
                        print(f"  [FAIL] Role '{role}' failed: {'; '.join(failure_reasons)}")
                        try:
                            print(f"  Page body text: {page.locator('body').inner_text()[:300]}")
                        except Exception:
                            pass
                        results[role] = {"status": "FAIL", "url": current_url, "reasons": failure_reasons}

                except Exception as ex:
                    print(f"  [ERROR] Role '{role}' encountered exception: {ex}")
                    results[role] = {"status": "ERROR", "error": str(ex)}

            # 5. Sprint 2: Emergency SOS Simulation Step
            print(f"\n[E2E] Testing Sprint 2 Emergency SOS Simulation Step...")
            try:
                context.clear_cookies()
                page.goto(f"{BASE_URL}/auth")
                page.evaluate("() => { localStorage.clear(); sessionStorage.clear(); }")
                page.goto(f"{BASE_URL}/auth")
                page.wait_for_load_state("networkidle")

                page.locator('input[type="text"]').first.fill("worker1")
                page.locator('input[type="password"]').first.fill("password123")
                page.locator('button[type="submit"]').first.click()
                page.wait_for_timeout(2000)

                # Click Confusion quick-picker to directly trigger SOS
                confusion_btn = page.locator('button:has-text("Confusion"), button:has-text("SOS")').first
                confusion_btn.wait_for(state="visible", timeout=5000)
                confusion_btn.click()
                page.wait_for_timeout(2000)

                page_text = page.content()
                sos_passed = True
                sos_reasons = []

                if "EMERGENCY ASSISTANCE DISPATCHED" not in page_text:
                    sos_passed = False
                    sos_reasons.append("Worker emergency screen banner not found")

                if "112" not in page_text or "108" not in page_text:
                    sos_passed = False
                    sos_reasons.append("Emergency tel buttons (112, 108) not displayed")

                if "I Am Safe" not in page_text:
                    sos_passed = False
                    sos_reasons.append("'I Am Safe' cancellation button missing")

                # Click 'I Am Safe' to cancel SOS
                if sos_passed:
                    safe_btn = page.locator('button:has-text("I Am Safe")').first
                    safe_btn.click()
                    page.wait_for_timeout(2000)
                    print("  [PASS] SOS simulation: Triggered, emergency screen verified, 'I Am Safe' executed.")
                    results["sos_simulation"] = {"status": "PASS"}
                else:
                    print(f"  [FAIL] SOS simulation failed: {'; '.join(sos_reasons)}")
                    results["sos_simulation"] = {"status": "FAIL", "reasons": sos_reasons}

            except Exception as ex:
                print(f"  [ERROR] SOS simulation encountered exception: {ex}")
                results["sos_simulation"] = {"status": "ERROR", "error": str(ex)}

            browser.close()

    finally:
        if server_proc:
            try:
                server_proc.terminate()
            except Exception:
                pass

    print("\n================ E2E SMOKE TEST SUMMARY ================")
    for r, res in results.items():
        print(f"  {r.upper()}: {res['status']} {res.get('reasons', res.get('error', ''))}")
    print("========================================================\n")
    return results


if __name__ == "__main__":
    run_e2e_smoke()
