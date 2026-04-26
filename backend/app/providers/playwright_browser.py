"""Shared Playwright tweaks for provider interactive login.

Many travel sites reject or mishandle automated browsers. These mitigations are
best-effort: they are not a guarantee against bot detection.

If login still fails with correct credentials, set ``PROVIDER_SLOW_LOGIN_TYPING``
to ``true`` so the connector types like a keyboard instead of using ``fill()``.
"""

from __future__ import annotations

import os

from playwright.sync_api import BrowserContext, Locator, Page
from playwright.sync_api import TimeoutError as PlaywrightTimeoutError

# Runs on every document before page scripts (via BrowserContext.add_init_script).
_AUTOMATION_INIT_SCRIPT = """
(() => {
  try {
    Object.defineProperty(Navigator.prototype, "webdriver", {
      get() {
        return undefined;
      },
      configurable: true,
    });
  } catch (e) {
    /* ignore */
  }
})();
"""


def prepare_persistent_browser_context(context: BrowserContext) -> None:
    """Register scripts and defaults for a persistent Chromium context."""
    context.add_init_script(_AUTOMATION_INIT_SCRIPT.strip())


def hardened_chromium_launch_options() -> dict:
    """Keyword args to merge into launch_persistent_context."""
    return {
        "ignore_default_args": ["--enable-automation"],
        "args": [
            "--start-maximized",
            "--disable-blink-features=AutomationControlled",
        ],
    }


def wait_first_visible_locator(
    page: Page,
    selectors: list[str],
    *,
    timeout_per_selector_ms: int = 8000,
) -> Locator | None:
    """First selector in *selectors* that yields a visible element, or ``None``."""
    for sel in selectors:
        loc = page.locator(sel).first
        try:
            loc.wait_for(state="visible", timeout=timeout_per_selector_ms)
            return loc
        except PlaywrightTimeoutError:
            continue
    return None


def click_and_fill_field(locator: Locator, value: str) -> None:
    """Focus the control and enter *value* (works better on some React forms)."""
    if not value:
        return
    slow = os.getenv("PROVIDER_SLOW_LOGIN_TYPING", "").lower() in {"1", "true", "yes"}
    locator.click(timeout=15000)
    if slow:
        locator.press_sequentially(value, delay=35, timeout=120000)
    else:
        locator.fill(value, timeout=20000)
