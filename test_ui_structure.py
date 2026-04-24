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

    print("=== Check UI Structure ===")
    panels = page.locator(".panel")
    print(f"Panel count: {panels.count()}")

    # Check blocks panel
    blocks_panel = page.locator("#blocks-panel")
    print(f"Blocks panel exists: {blocks_panel.count() > 0}")

    # Check empty state
    empty_state = page.locator(".empty-state")
    print(f"Empty state visible: {empty_state.count() > 0}")

    # Check grid layout
    main_grid = page.locator(".main-grid")
    print(f"Main grid exists: {main_grid.count() > 0}")

    # Get layout columns
    grid_style = page.evaluate("getComputedStyle(document.querySelector('.main-grid')).gridTemplateColumns")
    print(f"Grid columns: {grid_style}")

    print("\n=== Results ===")
    if errors:
        print(f"Console errors: {errors}")
    else:
        print("No console errors")

    browser.close()
    print("\nTest completed")