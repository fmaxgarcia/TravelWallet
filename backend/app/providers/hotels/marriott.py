import logging
import os
import re
import time
from datetime import datetime, timezone
from pathlib import Path

from playwright.sync_api import Page, sync_playwright
from playwright.sync_api import TimeoutError as PlaywrightTimeoutError

from app.providers.base import AccountSummary, Credentials, InteractiveLoginRequired
from app.providers.playwright_browser import (
    click_and_fill_field,
    hardened_chromium_launch_options,
    prepare_persistent_browser_context,
    wait_first_visible_locator,
)
from app.providers.storage import (
    get_provider_status,
    get_session_profile_dir,
    mark_session_connected,
    mark_session_reconnect_required,
)

logger = logging.getLogger(__name__)


class MarriottConnector:
    provider_key = "marriott"
    provider_name = "Marriott Bonvoy"
    login_url = "https://www.marriott.com/sign-in.mi"
    account_urls = (
        "https://www.marriott.com/loyalty/myAccount/default.mi",
        "https://www.marriott.com/",
    )
    interactive_timeout_seconds = 300

    def sync_account(self, credentials: Credentials) -> AccountSummary:
        status = get_provider_status(self.provider_key)
        if not status["has_session"]:
            raise InteractiveLoginRequired(
                "No saved Marriott session is available. Click Sync to sign in."
            )

        return self._run_session_flow(
            headless=self._headless_enabled(),
            credentials=credentials,
            initial_url=self.account_urls[0],
            interactive=False,
        )

    def connect_account(self, credentials: Credentials | None = None) -> AccountSummary:
        return self._run_session_flow(
            headless=False,
            credentials=credentials,
            initial_url=self.login_url,
            interactive=True,
        )

    def _run_session_flow(
        self,
        *,
        headless: bool,
        credentials: Credentials | None,
        initial_url: str,
        interactive: bool,
    ) -> AccountSummary:
        debug = self._debug_enabled()
        debug_dir = Path(__file__).resolve().parents[3] / "data"
        screenshot_path = debug_dir / "marriott_debug.png"
        html_path = debug_dir / "marriott_debug.html"
        meta_path = debug_dir / "marriott_debug_meta.txt"
        trace_path = debug_dir / "marriott_trace.zip"
        session_dir = get_session_profile_dir(self.provider_key)
        session_dir.parent.mkdir(parents=True, exist_ok=True)

        summary: AccountSummary | None = None
        with sync_playwright() as playwright:
            context = self._launch_browser_context(
                playwright=playwright,
                session_dir=session_dir,
                headless=headless,
                debug=debug,
                debug_dir=debug_dir,
            )
            page = context.pages[0] if context.pages else context.new_page()

            try:
                if debug:
                    context.tracing.start(screenshots=True, snapshots=True, sources=False)

                page.bring_to_front()
                logger.info("Marriott: opening %s", initial_url)
                page.goto(initial_url, wait_until="domcontentloaded", timeout=45000)
                if interactive:
                    page.wait_for_load_state("load", timeout=30000)
                    page.wait_for_timeout(2000)
                else:
                    page.wait_for_timeout(1500)

                if interactive:
                    if credentials is not None:
                        self._fill_login_form(page, credentials)
                    summary = self._wait_for_interactive_sign_in(page, credentials)
                    page.wait_for_timeout(1500)
                else:
                    summary = self._load_account_summary(page, credentials)
            except InteractiveLoginRequired as exc:
                if debug:
                    self._capture_debug_artifacts(page, screenshot_path, html_path, meta_path)
                mark_session_reconnect_required(self.provider_key, str(exc))
                raise
            except PlaywrightTimeoutError as exc:
                if debug:
                    self._capture_debug_artifacts(page, screenshot_path, html_path, meta_path)
                logger.exception("Marriott: timed out while loading page.")
                message = (
                    (
                        "Marriott sign-in timed out. Complete the sign-in in the opened browser "
                        "and try again."
                    )
                    if interactive
                    else "Marriott session expired. Click Sync to reconnect."
                )
                mark_session_reconnect_required(self.provider_key, message)
                raise InteractiveLoginRequired(message) from exc
            except Exception as exc:
                if debug:
                    self._capture_debug_artifacts(page, screenshot_path, html_path, meta_path)
                logger.exception("Marriott: failed to sync account.")
                message = (
                    "Marriott sign-in could not be completed. Click Sync to reconnect."
                    if not interactive
                    else (
                        "Marriott sign-in failed. Complete the sign-in in the opened browser "
                        "and try again."
                    )
                )
                mark_session_reconnect_required(self.provider_key, message)
                raise RuntimeError(message) from exc
            finally:
                if debug:
                    try:
                        context.tracing.stop(path=str(trace_path))
                    except Exception:
                        logger.exception("Marriott: failed to save Playwright trace.")
                context.close()

        assert summary is not None
        mark_session_connected(self.provider_key)
        return summary

    def _wait_for_interactive_sign_in(
        self,
        page: Page,
        credentials: Credentials | None,
    ) -> AccountSummary:
        logger.info("Marriott: waiting for user to complete sign in")
        deadline = time.monotonic() + self.interactive_timeout_seconds
        while time.monotonic() < deadline:
            if self._looks_authenticated(page):
                return self._load_account_summary(page, credentials, post_login=True)
            page.wait_for_timeout(1000)
        raise InteractiveLoginRequired(
            "Marriott sign-in timed out. Complete the sign-in in the opened browser and try again."
        )

    def _load_account_summary(
        self,
        page: Page,
        credentials: Credentials | None,
        *,
        post_login: bool = False,
    ) -> AccountSummary:
        if self._looks_authenticated(page):
            summary = self._extract_account_summary(page, credentials)
            if summary is not None:
                return summary

        for account_url in self.account_urls:
            logger.info("Marriott: loading account page %s", account_url)
            page.goto(account_url, wait_until="domcontentloaded", timeout=45000)
            page.wait_for_timeout(2000)

            if self._page_requires_login(page):
                continue

            summary = self._extract_account_summary(page, credentials)
            if summary is not None:
                return summary

        if post_login and self._looks_authenticated(page):
            logger.warning(
                "Marriott: session is active after sign-in but account summary could not be "
                "read from the page; persisting browser profile for a later sync."
            )
            return self._fallback_account_summary(credentials)

        message = "Marriott session expired. Click Sync to reconnect."
        if not post_login:
            mark_session_reconnect_required(self.provider_key, message)
        raise InteractiveLoginRequired(message)

    def _fallback_account_summary(self, credentials: Credentials | None) -> AccountSummary:
        return AccountSummary(
            provider=self.provider_name,
            member_id=(credentials.member_id if credentials else "") or "",
            points=0,
            tier="Member",
            last_updated=datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
        )

    @staticmethod
    def _headless_enabled() -> bool:
        return os.getenv("MARRIOTT_HEADLESS", "true").lower() not in {"0", "false", "no"}

    @staticmethod
    def _debug_enabled() -> bool:
        return os.getenv("MARRIOTT_DEBUG", "").lower() in {"1", "true", "yes"}

    @staticmethod
    def _launch_browser_context(
        *,
        playwright,
        session_dir: Path,
        headless: bool,
        debug: bool,
        debug_dir: Path,
    ):
        launch_options = {
            "user_data_dir": str(session_dir),
            "headless": headless,
            "no_viewport": True,
            **hardened_chromium_launch_options(),
            "record_har_path": str(debug_dir / "marriott_debug.har") if debug else None,
        }

        executable_path = os.getenv("MARRIOTT_BROWSER_PATH")
        if executable_path:
            logger.info(
                "Marriott: launching browser from MARRIOTT_BROWSER_PATH=%s",
                executable_path,
            )
            ctx = playwright.chromium.launch_persistent_context(
                executable_path=executable_path,
                **launch_options,
            )
            prepare_persistent_browser_context(ctx)
            return ctx

        preferred_channels = [
            channel.strip()
            for channel in os.getenv("MARRIOTT_BROWSER_CHANNELS", "chrome,msedge").split(",")
            if channel.strip()
        ]
        for channel in preferred_channels:
            try:
                logger.info("Marriott: launching persistent browser with channel=%s", channel)
                ctx = playwright.chromium.launch_persistent_context(
                    channel=channel,
                    **launch_options,
                )
                prepare_persistent_browser_context(ctx)
                return ctx
            except Exception:
                logger.exception("Marriott: failed to launch browser channel %s", channel)

        logger.info("Marriott: falling back to Playwright Chromium")
        ctx = playwright.chromium.launch_persistent_context(**launch_options)
        prepare_persistent_browser_context(ctx)
        return ctx

    def _looks_authenticated(self, page: Page) -> bool:
        current_url = page.url.lower()
        return not self._page_requires_login(page) and any(
            segment in current_url for segment in ("/myaccount/", "/loyalty/")
        )

    @staticmethod
    def _page_requires_login(page: Page) -> bool:
        current_url = page.url.lower()
        if "/sign-in.mi" in current_url or "/sign-in/" in current_url:
            return True
        try:
            password_field = page.locator("input[type='password']")
            return password_field.count() > 0
        except Exception:
            return False

    def _extract_account_summary(
        self,
        page: Page,
        credentials: Credentials | None,
    ) -> AccountSummary | None:
        page_text = self._page_text(page)
        points_text = self._read_text(
            page,
            (
                ".points_wrapper .t-title-s",
                ".points_wrapper span.t-title-s",
                "[data-testid='pointsBalance']",
            ),
        )

        points_match = re.search(r"(\d[\d,]*)", points_text or "")
        if points_match is None:
            points_match = re.search(r"(?:points?\s*balance)[^0-9]*(\d[\d,]*)", page_text, re.I)

        if points_match is None:
            return None

        tier_match = re.search(
            r"\b(Ambassador|Titanium|Platinum|Gold|Silver|Member)\b",
            page_text,
            re.I,
        )
        member_match = re.search(
            r"(?:member(?:ship)?(?:\s*(?:number|#))?)\s*([A-Z0-9]{6,})",
            page_text,
            re.I,
        )

        points_value = int(re.sub(r"[^0-9]", "", points_match.group(1)) or 0)
        member_value = self._normalize_member_id(member_match.group(1)) if member_match else ""
        if not member_value and credentials is not None:
            member_value = credentials.member_id

        return AccountSummary(
            provider=self.provider_name,
            member_id=member_value or "",
            points=points_value,
            tier=tier_match.group(1).title() if tier_match else "Member",
            last_updated=datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
        )

    @staticmethod
    def _page_text(page: Page) -> str:
        try:
            return page.locator("body").inner_text(timeout=3000)
        except Exception:
            return ""

    @staticmethod
    def _read_text(page: Page, selectors: tuple[str, ...]) -> str:
        for selector in selectors:
            try:
                locator = page.locator(selector)
                if locator.count() > 0:
                    return locator.first.inner_text(timeout=2000).strip()
            except Exception:
                continue
        return ""

    @staticmethod
    def _normalize_member_id(value: str) -> str:
        return re.sub(r"[^A-Z0-9]", "", value.upper())

    @staticmethod
    def _fill_login_form(page: Page, credentials: Credentials) -> None:
        def fill_with_selectors(selectors: list[str], value: str) -> bool:
            if not value:
                return False
            for selector in selectors:
                try:
                    locator = page.locator(selector)
                    if locator.count() > 0:
                        locator.first.fill(value)
                        return True
                except Exception:
                    continue
            return False

        # Bonvoy sign-in uses the same m-ui-library fields as other Marriott/Hyatt UIs:
        # email/member: data-testid email-text-field, name input-text-Email or Member Number
        # password: data-testid sign-in-pwrd, name input-text-Password
        user_selectors = [
            '[data-testid="email-text-field"] input',
            'input[name="input-text-Email or Member Number"]',
            "input[name='userId']",
            "input[name='username']",
            "input[name='email']",
            "input[id='username']",
        ]
        user_loc = wait_first_visible_locator(
            page, user_selectors[:2], timeout_per_selector_ms=12000
        )
        filled_user = False
        if user_loc is not None and credentials.member_id:
            try:
                click_and_fill_field(user_loc, credentials.member_id)
                filled_user = True
            except Exception:
                logger.exception("Marriott: primary user field fill failed; trying fallbacks")
        if not filled_user:
            filled_user = fill_with_selectors(user_selectors, credentials.member_id)
        if not filled_user:
            try:
                page.get_by_label(re.compile("email or member number", re.I)).fill(
                    credentials.member_id
                )
            except Exception:
                try:
                    page.get_by_label(re.compile("member|email|username", re.I)).fill(
                        credentials.member_id
                    )
                except Exception:
                    logger.info("Marriott: user field not found for prefill")

        pw_selectors = [
            '[data-testid="sign-in-pwrd"] input',
            'input[name="input-text-Password"]',
            "input[type='password']",
            "input[name='password']",
            "input[id='password']",
        ]
        pw_loc = wait_first_visible_locator(
            page, pw_selectors[:2], timeout_per_selector_ms=12000
        )
        filled_password = False
        if pw_loc is not None and credentials.password:
            try:
                click_and_fill_field(pw_loc, credentials.password)
                filled_password = True
            except Exception:
                logger.exception("Marriott: primary password field fill failed; trying fallbacks")
        if not filled_password:
            filled_password = fill_with_selectors(pw_selectors, credentials.password)
        if not filled_password:
            try:
                page.get_by_label(re.compile("sign in password|password", re.I)).fill(
                    credentials.password
                )
            except Exception:
                logger.info("Marriott: password field not found for prefill")

    @staticmethod
    def _capture_debug_artifacts(
        page: Page,
        screenshot_path: Path,
        html_path: Path,
        meta_path: Path,
    ) -> None:
        try:
            screenshot_path.parent.mkdir(parents=True, exist_ok=True)
            page.screenshot(path=str(screenshot_path), full_page=True)
            html_path.write_text(page.content(), encoding="utf-8")
            meta_path.write_text(
                f"url={page.url}\n"
                f"title={page.title()}\n",
                encoding="utf-8",
            )
        except Exception:
            logger.exception("Marriott: failed to capture debug screenshot.")
