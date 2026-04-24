from playwright.sync_api import sync_playwright
import os

HTML_PATH = os.path.abspath("index.html")
FILE_URL = f"file:///{HTML_PATH.replace(chr(92), '/')}"

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()

    # Capture console errors
    errors = []
    page.on("console", lambda msg: errors.append(msg.text) if msg.type == "error" else None)

    # Open the page
    page.goto(FILE_URL)
    page.wait_for_load_state("networkidle")

    print("=== Step 1: Page loaded ===")

    # Check token display exists
    token_display = page.locator("#token-display")
    token_text = token_display.text_content()
    print(f"Token display: {token_text}")

    # Add some content to trigger token counting
    # Find a textarea or input to type in
    prompt_input = page.locator("#prompt-input")
    if prompt_input.count() > 0:
        prompt_input.fill("Hello world this is a test")
        page.wait_for_timeout(500)
        token_text_after = token_display.text_content()
        print(f"Token display after typing: {token_text_after}")

    # Check for errors
    print("\n=== Results ===")
    if errors:
        print(f"Console errors: {errors}")
    else:
        print("No console errors")

    # Check Tiktoken is NOT loaded
    tiktoken_exists = page.evaluate("typeof Tiktoken !== 'undefined'")
    print(f"Tiktoken still loaded: {tiktoken_exists}")

    browser.close()
    print("\nTest completed")