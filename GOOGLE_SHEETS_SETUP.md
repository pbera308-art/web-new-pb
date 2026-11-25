# Google Sheet + Google Apps Script Setup (Free / Serverless)

## 1. Create or Upgrade the Google Sheet
1. Open [Google Sheets](https://sheets.google.com) and create a new spreadsheet named **`BSP-SMS Users`** (or open your existing **`BSP-SMS Users`** sheet).
2. Rename the bottom sheet tab from `Sheet1` to **`Users`** (or let `Code.gs` auto-create it on first request).
3. Exact required columns in **Row 1 (`A1:G1`)** — no extra columns are required:
   - `A1`: `user_id`
   - `B1`: `phone_number`
   - `C1`: `password` (stored as salted SHA-256 `sha256s:<salt>:<hash>`)
   - `D1`: `status` (`inactive` or `active`)
   - `E1`: `expiry_date` (`YYYY-MM-DD`)
   - `F1`: `active_device_id`
   - `G1`: `last_login`

## 2. Deploy or Update Google Apps Script
1. Inside the Google Sheet, click **Extensions → Apps Script**.
2. Replace the contents of `Code.gs` with the full contents of `google-apps-script/Code.gs`.
3. Click **Save** (`Ctrl+S`).
4. For a new deployment: click **Deploy → New deployment** → **Web app** (**Execute as:** `Me`, **Who has access:** `Anyone`) → **Deploy** and copy the `/exec` URL.
   For an existing deployment: click **Deploy → Manage deployments → Edit (pencil) → Version: New version → Deploy** so the same `/exec` URL runs the updated script.

## 3. Built-in Apps Script Backend URL
The Android app has your Google Apps Script Web App `/exec` URL permanently built into `AuthRepository.kt` (`APPS_SCRIPT_URL`) and `BSP-SMS-Android/app/build.gradle.kts`, so **Register**, **General Login**, and **Admin Monitor** work immediately on every install with no manual URL configuration required.

## 4. Admin Controls & Per-User Portal Isolation
- **Admin Dashboard & User Management:** Signing in as Admin (`ID: 9679843774`, `Pass: 9933115114`) opens **Admin Monitor** automatically and fetches all users from Google Sheets, showing **Total Users**, **Active**, **Inactive**, **Logged In**, and **Portal Active** counts, with Search and Filters (`All`, `Active`, `Inactive`, `Logged In`, `Expired`).
- **Individual Account Controls:** Tap **Activate (30d)** (sets `status = active`, calculates 30-day `expiry_date`, and clears `active_device_id`), **Deactivate** (sets `status = inactive` and blocks General Login), **Reset Device** (clears `active_device_id` without changing status/expiry), **Edit**, **Password**, or **Delete**.
- **Individual Portal Session Controls:** View each user's live Banglarshiksha portal status (`Portal: Active Session` / `Signed Out`), tap **Force Portal Out** or **Reset Portal** to increment `portal_reset_version` so that user's isolated WebView profile is wiped and returned to the fresh Banglarshiksha Sign In screen on next check or open.
- **Directly in Google Sheets:** Changing `status` (`D`) to `active` runs the Apps Script `onEdit` trigger to assign a 30-day `expiry_date` if empty/expired and clear `active_device_id`. Changing `status` (`D`) to `inactive` automatically clears `app_logged_in` and `session_token`.

