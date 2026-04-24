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

    print("=== Open Settings ===")
    # Find and click settings button
    for btn in page.locator("button").all():
        if "设置" in btn.text_content():
            btn.click()
            break
    page.wait_for_timeout(500)

    print("=== Check General Tab ===")
    # Check if hints are visible
    hints = page.locator(".config-hint")
    print(f"Hint elements found: {hints.count()}")

    for i in range(hints.count()):
        hint_text = hints.nth(i).text_content()
        print(f"  Hint {i+1}: {hint_text}")

    # Check sections
    sections = page.locator(".settings-group h3")
    for i in range(sections.count()):
        print(f"  Section: {sections.nth(i).text_content()}")

    print("\n=== Results ===")
    if errors:
        print(f"Console errors: {errors}")
    else:
        print("No console errors")

    browser.close()
    print("\nTest completed")