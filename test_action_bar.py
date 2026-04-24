from playwright.sync_api import sync_playwright
import os

HTML_PATH = os.path.abspath("index.html")
FILE_URL = f"file:///{HTML_PATH.replace(chr(92), '/')}"

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()

    errors = []
    page.on("console", lambda msg: errors.append(msg.text) if msg.type == "error" else None)

    page.goto(FILE_URL)
    page.wait_for_load_state("networkidle")

    print("=== Check Action Bar ===")
    action_bar = page.locator(".action-bar")
    if action_bar.count() > 0:
        print("Action bar found")

    buttons = page.locator(".action-bar .btn")
    print(f"Buttons in action bar: {buttons.count()}")

    for i in range(buttons.count()):
        btn = buttons.nth(i)
        classes = btn.get_attribute("class")
        print(f"  {i+1}. class='{classes}'")

    print("\n=== Results ===")
    if errors:
        print(f"Console errors: {errors}")
    else:
        print("No console errors")

    browser.close()
    print("\nTest completed")