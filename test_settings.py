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

    # Check for settings button
    buttons = page.locator("button")
    print(f"Total buttons: {buttons.count()}")

    # Find and click settings button
    for btn in buttons.all():
        text = btn.text_content()
        if "设置" in text or "\u2699" in text:
            print("Found settings button, clicking...")
            btn.click()
            break

    page.wait_for_timeout(500)

    # Check modal is open
    modal_classes = page.evaluate("document.getElementById('settings-modal').className")
    print(f"Modal classes: {modal_classes}")

    # === Test Tab Switching ===
    print("\n=== Step 2: Test Tab Switching ===")
    tabs = page.locator(".modal-tab")
    print(f"Found {tabs.count()} tabs")

    # Click presets tab
    presets_tab = page.locator('.modal-tab:has-text("自定义模板")')
    if presets_tab.count() > 0:
        presets_tab.click()
        page.wait_for_timeout(300)
        print("Clicked presets tab")

        # Check if tab content is visible
        presets_content = page.locator("#tab-presets")
        is_visible = presets_content.evaluate("el => el.classList.contains('active')")
        print(f"Presets tab content active: {is_visible}")

        # Check for preset list
        preset_list = page.locator("#preset-list")
        items = preset_list.locator(".preset-item")
        print(f"Preset items count: {items.count()}")
    else:
        print("ERROR: Presets tab not found")

    # === Test toggle setting ===
    print("\n=== Step 3: Test Toggle Settings ===")
    # Go to general tab first
    general_tab = page.locator('.modal-tab:has-text("通用设置")')
    general_tab.click()
    page.wait_for_timeout(300)

    # Find show token count toggle
    toggle = page.locator("#cfg-show-token-count")
    if toggle.count() > 0:
        is_checked = toggle.evaluate("el => el.checked")
        print(f"Show token count toggle checked: {is_checked}")

        # Use JavaScript to click the checkbox (since it's styled with opacity:0)
        page.evaluate("document.getElementById('cfg-show-token-count').click()")
        page.wait_for_timeout(100)
        is_checked_after = page.evaluate("document.getElementById('cfg-show-token-count').checked")
        print(f"After click, checked: {is_checked_after}")
    else:
        print("ERROR: Toggle not found")

    # Check for console errors
    print("\n=== Results ===")
    if errors:
        print(f"Console errors: {errors}")
    else:
        print("No console errors")

    browser.close()
    print("\nTest completed")