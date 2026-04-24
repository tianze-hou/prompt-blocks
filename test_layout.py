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

    print("=== Check Layout ===")
    grid = page.locator(".main-grid")
    grid_style = page.evaluate("getComputedStyle(document.querySelector('.main-grid')).gridTemplateColumns")
    print(f"Grid columns: {grid_style}")

    panels = page.locator(".panel")
    print(f"Panel count: {panels.count()}")

    input_panel = page.locator(".panel.input-panel")
    print(f"Input panel exists: {input_panel.count() > 0}")

    blocks_container = page.locator("#blocks-container")
    print(f"Blocks container exists: {blocks_container.count() > 0}")

    empty_state = page.locator(".empty-state")
    print(f"Empty state visible: {empty_state.count() > 0}")

    block_count = page.locator("#block-count")
    print(f"Block count element exists: {block_count.count() > 0}")

    print("\n=== Results ===")
    if errors:
        print(f"Console errors: {errors}")
    else:
        print("No console errors")

    browser.close()
    print("\nTest completed")