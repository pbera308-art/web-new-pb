/**
 * BSP-SMS Serverless Auth, 30-Day Activation, Single-Device Lock & Admin Control
 * Compatible with exact Google Sheet columns A to G:
 *   A: user_id
 *   B: phone_number
 *   C: password
 *   D: status
 *   E: expiry_date
 *   F: active_device_id
 *   G: last_login
 *
 * Deploy as Web App:
 *   Execute as: Me
 *   Who has access: Anyone
 */

const SHEET_NAME = "Users";
const TIMEZONE = "Asia/Kolkata";
const ADMIN_ID = "9679843774";
const ADMIN_PASSWORD = "9933115114";

const HEADERS = [
  "user_id",
  "phone_number",
  "password",
  "status",
  "expiry_date",
  "active_device_id",
  "last_login"
];

function doGet(e) {
  if (e && e.parameter && e.parameter.action) {
    return executeWithLock(e.parameter);
  }
  return jsonOut({ ok: true, status: "success", message: "BSP-SMS Auth Service Ready" });
}

function doPost(e) {
  let body = {};
  try {
    const raw = (e && e.postData && e.postData.contents) ? e.postData.contents : "";
    if (raw) {
      body = JSON.parse(raw);
    }
  } catch (parseErr) {
    body = {};
  }
  if (e && e.parameter) {
    const paramKeys = Object.keys(e.parameter);
    for (let i = 0; i < paramKeys.length; i++) {
      const k = paramKeys[i];
      if (body[k] === undefined || body[k] === "") {
        body[k] = e.parameter[k];
      }
    }
  }
  return executeWithLock(body);
}

function executeWithLock(body) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const action = String((body && body.action) || "").trim().toLowerCase();

    switch (action) {
      case "register":
        return jsonOut(handleRegister(body));
      case "login":
        return jsonOut(handleLogin(body));
      case "logout":
        return jsonOut(handleLogout(body));
      case "check_session":
      case "verify_status":
        return jsonOut(handleCheckSession(body));
      case "update_activity":
        return jsonOut(handleUpdateActivity(body));
      case "report_portal_state":
        return jsonOut(handleReportPortalState(body));
      case "admin_login":
        return jsonOut(handleAdminLogin(body));
      case "admin_list_users":
      case "list_users":
      case "list":
      case "get_users":
        return jsonOut(handleAdminListUsers(body));
      case "admin_activate_user":
      case "activate":
        return jsonOut(handleAdminActivateUser(body));
      case "admin_deactivate_user":
      case "deactivate":
      case "inactive":
        return jsonOut(handleAdminDeactivateUser(body));
      case "admin_edit_user":
        return jsonOut(handleAdminEditUser(body));
      case "admin_reset_password":
        return jsonOut(handleAdminResetPassword(body));
      case "admin_delete_user":
        return jsonOut(handleAdminDeleteUser(body));
      case "admin_reset_device":
      case "reset_device":
        return jsonOut(handleAdminResetDevice(body));
      case "admin_force_portal_logout":
      case "admin_reset_portal_session":
        return jsonOut(handleAdminResetPortalSession(body, action === "admin_force_portal_logout"));
      default:
        return jsonOut({ ok: false, status: "error", code: "UNKNOWN_ACTION", message: "Unsupported action: " + action });
    }
  } catch (err) {
    return jsonOut({ ok: false, status: "error", code: "SERVER_ERROR", message: String(err && err.message ? err.message : err) });
  } finally {
    lock.releaseLock();
  }
}

function normalizeHeaderKey(raw) {
  return String(raw || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function ensureHeaders(sheet) {
  const currentLastCol = sheet.getLastColumn();
  if (currentLastCol === 0) {
    sheet.appendRow(HEADERS);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight("bold");
    sheet.setFrozenRows(1);
  }
}

function getSheetSchema(sheet) {
  ensureHeaders(sheet);
  const lastCol = Math.max(sheet.getLastColumn(), HEADERS.length);
  const headerRow = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const map = {};
  for (let i = 0; i < headerRow.length; i++) {
    const key = normalizeHeaderKey(headerRow[i]);
    if (key && map[key] === undefined) {
      map[key] = i;
    }
  }

  function findCol(aliases, fallbackIndex) {
    for (let i = 0; i < aliases.length; i++) {
      const norm = normalizeHeaderKey(aliases[i]);
      if (map[norm] !== undefined) return map[norm];
    }
    return fallbackIndex;
  }

  return {
    colCount: lastCol,
    userId: findCol(["user_id", "userid", "id", "uid"], 0),
    phone: findCol(["phone_number", "phonenumber", "phone", "mobile", "mobilenumber", "contact"], 1),
    password: findCol(["password", "pass", "pwd"], 2),
    status: findCol(["status", "state", "account_status"], 3),
    expiryDate: findCol(["expiry_date", "expirydate", "expiry", "valid_until", "validuntil", "expires_at"], 4),
    activeDeviceId: findCol(["active_device_id", "activedeviceid", "device_id", "deviceid", "device"], 5),
    lastLogin: findCol(["last_login", "lastlogin", "lastloginat", "login_time"], 6),
    // Optional columns: -1 when absent in A:G sheets
    lastActivity: findCol(["last_activity", "lastactivity", "activity", "updated_at"], -1),
    createdAt: findCol(["created_at", "createdat", "registered_at"], -1),
    fullName: findCol(["full_name", "fullname", "name", "display_name"], -1),
    username: findCol(["username", "user_name", "login_name"], -1),
    role: findCol(["role", "user_role", "account_role"], -1),
    appLoggedIn: findCol(["app_logged_in", "apploggedin", "is_logged_in", "logged_in"], -1),
    sessionToken: findCol(["session_token", "sessiontoken", "token"], -1),
    portalSessionActive: findCol(["portal_session_active", "portalsessionactive", "portal_active"], -1),
    portalResetVersion: findCol(["portal_reset_version", "portalresetversion", "portal_reset"], -1),
    portalLastUpdated: findCol(["portal_last_updated", "portallastupdated", "portal_updated_at"], -1)
  };
}

function setCellIfPresent(sheet, rowIndex, colIndex, value, numberFormat) {
  if (colIndex < 0) return;
  const cell = sheet.getRange(rowIndex, colIndex + 1);
  if (numberFormat) {
    cell.setNumberFormat(numberFormat);
  }
  cell.setValue(value);
}

function onEdit(e) {
  if (!e || !e.range) return;
  const sheet = e.range.getSheet();
  if (sheet.getName() !== SHEET_NAME) return;
  const row = e.range.getRow();
  const col = e.range.getColumn();
  const schema = getSheetSchema(sheet);
  if (row <= 1 || col !== schema.status + 1) return;

  const newStatus = String(e.value || "").trim().toLowerCase();
  if (newStatus === "active") {
    const expiryCell = sheet.getRange(row, schema.expiryDate + 1);
    const currentExpiry = formatDateValue(expiryCell.getValue());
    if (!currentExpiry || todayStr() > currentExpiry) {
      expiryCell.setNumberFormat("@").setValue(addDaysStr(30));
    }
    sheet.getRange(row, schema.activeDeviceId + 1).setValue("");
    setCellIfPresent(sheet, row, schema.lastActivity, "Activated 30d & device unlocked in Sheet (" + nowStr() + ")");
  } else if (newStatus === "inactive") {
    setCellIfPresent(sheet, row, schema.appLoggedIn, "false");
    setCellIfPresent(sheet, row, schema.sessionToken, "");
    setCellIfPresent(sheet, row, schema.lastActivity, "Deactivated in Sheet (" + nowStr() + ")");
  }
}

function getUsersSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(HEADERS);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight("bold");
    sheet.setFrozenRows(1);
  } else {
    ensureHeaders(sheet);
  }
  return sheet;
}

function normalizePhone(raw) {
  const digits = String(raw || "").replace(/\D+/g, "");
  if (digits.length > 10) {
    if (digits.startsWith("91") && digits.length >= 12) {
      return digits.slice(digits.length - 10);
    }
    if (digits.startsWith("0") && digits.length === 11) {
      return digits.slice(1);
    }
    return digits.slice(digits.length - 10);
  }
  return digits;
}

function sha256Hex(input) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(input), Utilities.Charset.UTF_8);
  return bytes.map(b => ((b < 0 ? b + 256 : b).toString(16)).padStart(2, "0")).join("");
}

function hashPassword(plain) {
  const salt = Utilities.getUuid().replace(/-/g, "").slice(0, 16);
  return "sha256s:" + salt + ":" + sha256Hex(salt + ":" + String(plain));
}

function hashLegacySha256(plain) {
  return "sha256:" + sha256Hex(String(plain));
}

function verifyPassword(stored, inputPlain) {
  const s = String(stored || "");
  const p = String(inputPlain || "");
  const sTrimmed = s.trim();
  const pTrimmed = p.trim();
  if (!sTrimmed) return false;

  if (sTrimmed.startsWith("sha256s:")) {
    const parts = sTrimmed.split(":");
    if (parts.length !== 3) return false;
    const salt = parts[1];
    const expectedHash = parts[2];
    return sha256Hex(salt + ":" + p) === expectedHash || sha256Hex(salt + ":" + pTrimmed) === expectedHash;
  }
  if (sTrimmed.startsWith("sha256:")) {
    return sTrimmed === hashLegacySha256(p) || sTrimmed === hashLegacySha256(pTrimmed);
  }
  return s === p || sTrimmed === pTrimmed;
}

function toBool(val) {
  if (val === true) return true;
  const s = String(val || "").trim().toLowerCase();
  return s === "true" || s === "1" || s === "yes" || s === "active";
}

function toInt(val, fallback) {
  const n = parseInt(String(val === undefined || val === null ? "" : val).trim(), 10);
  return isNaN(n) ? (fallback || 0) : n;
}

function todayStr() {
  return Utilities.formatDate(new Date(), TIMEZONE, "yyyy-MM-dd");
}

function nowStr() {
  return Utilities.formatDate(new Date(), TIMEZONE, "yyyy-MM-dd HH:mm:ss");
}

function addDaysStr(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return Utilities.formatDate(d, TIMEZONE, "yyyy-MM-dd");
}

function formatDateValue(val) {
  if (!val) return "";
  if (Object.prototype.toString.call(val) === "[object Date]" && !isNaN(val.getTime())) {
    return Utilities.formatDate(val, TIMEZONE, "yyyy-MM-dd");
  }
  const s = String(val).trim();
  if (!s) return "";
  const token = s.split("T")[0].split(" ")[0].replace(/\//g, "-");
  if (/^\d{4}-\d{2}-\d{2}$/.test(token)) {
    return token;
  }
  const dmy = /^(\d{2})-(\d{2})-(\d{4})$/.exec(token);
  if (dmy) {
    return dmy[3] + "-" + dmy[2] + "-" + dmy[1];
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    return s.slice(0, 10);
  }
  return s;
}

function formatTimestampValue(val) {
  if (!val) return "";
  if (Object.prototype.toString.call(val) === "[object Date]" && !isNaN(val.getTime())) {
    return Utilities.formatDate(val, TIMEZONE, "yyyy-MM-dd HH:mm:ss");
  }
  return String(val).trim();
}

function readOptional(row, colIndex) {
  return colIndex >= 0 ? row[colIndex] : "";
}

function rowToUser(row, schema) {
  const userId = String(row[schema.userId] || "").trim().toUpperCase();
  const phone = normalizePhone(row[schema.phone]) || String(row[schema.phone] || "").trim();
  const status = String(row[schema.status] || "inactive").trim().toLowerCase() || "inactive";
  const expiryDate = formatDateValue(row[schema.expiryDate]);
  const activeDeviceId = String(row[schema.activeDeviceId] || "").trim();
  const lastLogin = formatTimestampValue(row[schema.lastLogin]);

  const fullName = String(readOptional(row, schema.fullName) || "").trim();
  const username = String(readOptional(row, schema.username) || "").trim();
  const role = String(readOptional(row, schema.role) || "general").trim().toLowerCase() || "general";
  const hasAppLoggedInCol = schema.appLoggedIn >= 0;
  const appLoggedIn = hasAppLoggedInCol
    ? toBool(row[schema.appLoggedIn])
    : (activeDeviceId !== "" && status === "active" && !!expiryDate && todayStr() <= expiryDate);

  const out = {
    userId: userId,
    user_id: userId,
    phone: phone,
    phone_number: phone,
    status: status,
    expiryDate: expiryDate,
    expiry_date: expiryDate,
    activeDeviceId: activeDeviceId,
    active_device_id: activeDeviceId,
    lastLogin: lastLogin,
    last_login: lastLogin,
    appLoggedIn: appLoggedIn
  };

  if (fullName) out.fullName = fullName;
  if (username) out.username = username;
  if (schema.role >= 0) out.role = role;
  if (schema.lastActivity >= 0) out.lastActivity = String(row[schema.lastActivity] || "").trim();
  if (schema.createdAt >= 0) out.createdAt = formatTimestampValue(row[schema.createdAt]);
  if (schema.portalSessionActive >= 0) out.portalSessionActive = toBool(row[schema.portalSessionActive]);
  if (schema.portalResetVersion >= 0) out.portalResetVersion = toInt(row[schema.portalResetVersion], 0);
  if (schema.portalLastUpdated >= 0) out.portalLastUpdated = formatTimestampValue(row[schema.portalLastUpdated]);

  return out;
}

function handleRegister(body) {
  const userId = String(body.userId || body.user_id || body.id || "").trim().toUpperCase();
  const phone = normalizePhone(body.phone || body.phone_number || body.mobile || "");
  const password = String(body.password || body.pass || "").trim();
  const deviceId = String(body.deviceId || body.device_id || "").trim();
  const fullName = String(body.fullName || body.full_name || body.name || "").trim();
  const rawUsername = String(body.username || body.user_name || "").trim();

  if (!userId || userId.length < 4) {
    return { ok: false, status: "error", code: "INVALID_INPUT", message: "Valid User ID is required." };
  }
  if (!phone || phone.length < 10) {
    return { ok: false, status: "error", code: "INVALID_PHONE", message: "Please enter a valid 10-digit phone number." };
  }
  if (!password || password.length < 4) {
    return { ok: false, status: "error", code: "WEAK_PASSWORD", message: "Password must be at least 4 characters." };
  }

  const sheet = getUsersSheet();
  const schema = getSheetSchema(sheet);
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    const values = sheet.getRange(2, 1, lastRow - 1, schema.colCount).getValues();
    for (let i = 0; i < values.length; i++) {
      const existingId = String(values[i][schema.userId] || "").trim().toUpperCase();
      const existingPhone = normalizePhone(values[i][schema.phone]);
      if (existingId === userId) {
        return { ok: false, status: "error", code: "USER_ID_EXISTS", message: "User ID already exists. Generate a new ID and try again." };
      }
      if (existingPhone === phone) {
        return { ok: false, status: "error", code: "PHONE_EXISTS", message: "This phone number is already registered. Please use General Login." };
      }
      if (schema.username >= 0 && rawUsername) {
        const existingUsername = String(values[i][schema.username] || "").trim().toLowerCase();
        if (existingUsername && existingUsername === rawUsername.toLowerCase()) {
          return { ok: false, status: "error", code: "USERNAME_EXISTS", message: "This username is already taken. Choose another username." };
        }
      }
    }
  }

  const createdAt = nowStr();
  const newRow = new Array(schema.colCount).fill("");
  newRow[schema.userId] = userId;
  newRow[schema.phone] = phone;
  newRow[schema.password] = hashPassword(password);
  newRow[schema.status] = "inactive";
  newRow[schema.expiryDate] = "";
  newRow[schema.activeDeviceId] = deviceId;
  newRow[schema.lastLogin] = "";

  if (schema.lastActivity >= 0) newRow[schema.lastActivity] = "Registered (awaiting admin activation)";
  if (schema.createdAt >= 0) newRow[schema.createdAt] = createdAt;
  if (schema.fullName >= 0 && fullName) newRow[schema.fullName] = fullName;
  if (schema.username >= 0 && rawUsername) newRow[schema.username] = rawUsername;
  if (schema.role >= 0) newRow[schema.role] = "general";
  if (schema.appLoggedIn >= 0) newRow[schema.appLoggedIn] = "false";
  if (schema.sessionToken >= 0) newRow[schema.sessionToken] = "";
  if (schema.portalSessionActive >= 0) newRow[schema.portalSessionActive] = "false";
  if (schema.portalResetVersion >= 0) newRow[schema.portalResetVersion] = 0;
  if (schema.portalLastUpdated >= 0) newRow[schema.portalLastUpdated] = "";

  sheet.appendRow(newRow);

  const newRowIdx = sheet.getLastRow();
  sheet.getRange(newRowIdx, schema.phone + 1).setNumberFormat("@").setValue(phone);
  if (schema.username >= 0 && rawUsername) {
    sheet.getRange(newRowIdx, schema.username + 1).setNumberFormat("@").setValue(rawUsername);
  }

  return {
    ok: true,
    status: "success",
    code: "REGISTERED",
    message: "Registration successful. Your account is inactive until activated by Admin.",
    user: rowToUser(sheet.getRange(newRowIdx, 1, 1, schema.colCount).getValues()[0], schema)
  };
}

function findUserRow(sheet, schema, identifier) {
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return null;

  const rawTrimmed = String(identifier || "").trim();
  const idUpper = rawTrimmed.toUpperCase();
  const idLower = rawTrimmed.toLowerCase();
  const phoneNorm = normalizePhone(rawTrimmed);
  const values = sheet.getRange(2, 1, lastRow - 1, schema.colCount).getValues();

  for (let i = 0; i < values.length; i++) {
    const rowUserId = String(values[i][schema.userId] || "").trim().toUpperCase();
    const rowPhoneRaw = String(values[i][schema.phone] || "").trim();
    const rowPhone = normalizePhone(rowPhoneRaw);
    const rowUsername = schema.username >= 0
      ? String(values[i][schema.username] || "").trim().toLowerCase()
      : "";
    if (
      (idUpper && rowUserId === idUpper) ||
      (idLower && rowUsername && rowUsername === idLower) ||
      (phoneNorm && phoneNorm.length >= 10 && rowPhone === phoneNorm) ||
      (rawTrimmed && rowPhoneRaw === rawTrimmed)
    ) {
      return { rowIndex: i + 2, row: values[i] };
    }
  }
  return null;
}

function handleLogin(body) {
  const identifier = String(
    body.identifier ||
    body.userId ||
    body.user_id ||
    body.phone ||
    body.phone_number ||
    body.mobile ||
    body.username ||
    ""
  ).trim();
  const password = String(body.password || body.pass || "").trim();
  const deviceId = String(body.deviceId || body.device_id || "").trim();

  if (!identifier || !password) {
    return { ok: false, status: "error", code: "INVALID_INPUT", message: "Enter User ID or Phone Number and Password." };
  }
  if (!deviceId) {
    return { ok: false, status: "error", code: "DEVICE_REQUIRED", message: "Device ID unavailable." };
  }

  const sheet = getUsersSheet();
  const schema = getSheetSchema(sheet);
  const found = findUserRow(sheet, schema, identifier);
  if (!found) {
    return { ok: false, status: "error", code: "NOT_FOUND", message: "Account not found. Please register first." };
  }

  const { rowIndex, row } = found;
  const storedPwd = String(row[schema.password] || "");
  if (!verifyPassword(storedPwd, password)) {
    return { ok: false, status: "error", code: "BAD_PASSWORD", message: "Incorrect password." };
  }

  if (!storedPwd.trim().startsWith("sha256s:")) {
    sheet.getRange(rowIndex, schema.password + 1).setValue(hashPassword(password));
  }

  const user = rowToUser(row, schema);
  const displayId = user.userId || user.phone || identifier;
  if (user.status !== "active") {
    return {
      ok: false,
      status: "error",
      code: "INACTIVE",
      message: "Your account (" + displayId + ") is inactive. Contact Admin for activation.",
      user: user
    };
  }

  let expiryDate = user.expiryDate;
  if (!expiryDate) {
    expiryDate = addDaysStr(30);
    sheet.getRange(rowIndex, schema.expiryDate + 1).setNumberFormat("@").setValue(expiryDate);
    user.expiryDate = expiryDate;
    user.expiry_date = expiryDate;
  }

  if (todayStr() > expiryDate) {
    return {
      ok: false,
      status: "error",
      code: "EXPIRED",
      message: "Your 1-month (30-day) subscription expired on " + expiryDate + ". Contact Admin to renew.",
      user: user
    };
  }

  if (user.activeDeviceId && user.activeDeviceId !== deviceId) {
    return {
      ok: false,
      status: "error",
      code: "DEVICE_LOCKED",
      message: "Account locked to another device (" + user.activeDeviceId.slice(0, 8) + "...). Ask Admin to reset device lock.",
      user: user
    };
  }

  const loginTs = nowStr();
  const sessionToken = Utilities.getUuid().replace(/-/g, "");
  if (!user.activeDeviceId) {
    sheet.getRange(rowIndex, schema.activeDeviceId + 1).setValue(deviceId);
    user.activeDeviceId = deviceId;
    user.active_device_id = deviceId;
  }
  sheet.getRange(rowIndex, schema.lastLogin + 1).setValue(loginTs);
  setCellIfPresent(sheet, rowIndex, schema.lastActivity, "Logged in (" + loginTs + ")");
  setCellIfPresent(sheet, rowIndex, schema.appLoggedIn, "true");
  setCellIfPresent(sheet, rowIndex, schema.sessionToken, sessionToken);

  user.lastLogin = loginTs;
  user.last_login = loginTs;
  user.appLoggedIn = true;

  return {
    ok: true,
    status: "success",
    code: "OK",
    message: "Login successful.",
    sessionToken: sessionToken,
    user: user
  };
}

function handleLogout(body) {
  const userId = String(body.userId || body.user_id || body.identifier || "").trim();
  const deviceId = String(body.deviceId || body.device_id || "").trim();
  if (!userId) {
    return { ok: true, status: "success", code: "OK", message: "Signed out." };
  }
  const sheet = getUsersSheet();
  const schema = getSheetSchema(sheet);
  const found = findUserRow(sheet, schema, userId);
  if (!found) {
    return { ok: true, status: "success", code: "OK", message: "Signed out." };
  }
  const { rowIndex, row } = found;
  const user = rowToUser(row, schema);
  if (user.activeDeviceId && deviceId && user.activeDeviceId !== deviceId) {
    return { ok: true, status: "success", code: "OK", message: "Signed out locally." };
  }
  setCellIfPresent(sheet, rowIndex, schema.appLoggedIn, "false");
  setCellIfPresent(sheet, rowIndex, schema.sessionToken, "");
  setCellIfPresent(sheet, rowIndex, schema.lastActivity, "Signed out (" + nowStr() + ")");
  return { ok: true, status: "success", code: "OK", message: "Signed out." };
}

function handleCheckSession(body) {
  const userId = String(body.userId || body.user_id || body.identifier || "").trim();
  const deviceId = String(body.deviceId || body.device_id || "").trim();
  const clientToken = String(body.sessionToken || body.session_token || "").trim();
  if (!userId || !deviceId) {
    return { ok: false, status: "error", code: "INVALID_SESSION", message: "Session invalid." };
  }

  const sheet = getUsersSheet();
  const schema = getSheetSchema(sheet);
  const found = findUserRow(sheet, schema, userId);
  if (!found) {
    return { ok: false, status: "error", code: "NOT_FOUND", message: "Account no longer exists." };
  }

  const { rowIndex, row } = found;
  const user = rowToUser(row, schema);

  if (user.status !== "active") {
    return {
      ok: false,
      status: "error",
      code: "INACTIVE",
      message: "Your account has been deactivated by Admin. Access is blocked until reactivated.",
      user: user
    };
  }

  if (!user.expiryDate || todayStr() > user.expiryDate) {
    return {
      ok: false,
      status: "error",
      code: "EXPIRED",
      message: "Your 1-month (30-day) subscription expired on " + (user.expiryDate || "N/A") + ". Contact Admin to renew.",
      user: user
    };
  }

  if (!user.activeDeviceId || user.activeDeviceId !== deviceId) {
    return {
      ok: false,
      status: "error",
      code: "DEVICE_LOCKED",
      message: "Device lock mismatch or reset by Admin. Please sign in again.",
      user: user
    };
  }

  if (schema.sessionToken >= 0) {
    const storedToken = String(row[schema.sessionToken] || "").trim();
    if (storedToken && clientToken && storedToken !== clientToken) {
      return {
        ok: false,
        status: "error",
        code: "SESSION_REVOKED",
        message: "Your session was ended or password was reset by Admin. Please sign in again.",
        user: user
      };
    }
  }

  setCellIfPresent(sheet, rowIndex, schema.appLoggedIn, "true");
  setCellIfPresent(sheet, rowIndex, schema.lastActivity, "Session verified (" + nowStr() + ")");
  user.appLoggedIn = true;
  return { ok: true, status: "success", code: "OK", message: "Session valid.", user: user };
}

function handleUpdateActivity(body) {
  const userId = String(body.userId || body.user_id || body.identifier || "").trim();
  const deviceId = String(body.deviceId || body.device_id || "").trim();
  const activity = String(body.activity || "Active").trim();

  const sheet = getUsersSheet();
  const schema = getSheetSchema(sheet);
  const found = findUserRow(sheet, schema, userId);
  if (!found) {
    return { ok: false, status: "error", code: "NOT_FOUND", message: "Account not found." };
  }
  const { rowIndex, row } = found;
  const user = rowToUser(row, schema);
  if (user.status !== "active") {
    return { ok: false, status: "error", code: "INACTIVE", message: "Account is inactive." };
  }
  if (user.activeDeviceId && deviceId && user.activeDeviceId !== deviceId) {
    return { ok: false, status: "error", code: "DEVICE_LOCKED", message: "Device lock mismatch." };
  }
  setCellIfPresent(sheet, rowIndex, schema.appLoggedIn, "true");
  setCellIfPresent(sheet, rowIndex, schema.lastActivity, activity + " (" + nowStr() + ")");
  return { ok: true, status: "success", code: "OK", message: "Activity updated." };
}

function handleReportPortalState(body) {
  const userId = String(body.userId || body.user_id || body.identifier || "").trim();
  const deviceId = String(body.deviceId || body.device_id || "").trim();
  const portalActive = toBool(body.portalSessionActive !== undefined ? body.portalSessionActive : body.portal_session_active);
  const activity = String(body.activity || "").trim();

  const sheet = getUsersSheet();
  const schema = getSheetSchema(sheet);
  const found = findUserRow(sheet, schema, userId);
  if (!found) {
    return { ok: false, status: "error", code: "NOT_FOUND", message: "Account not found." };
  }
  const { rowIndex, row } = found;
  const user = rowToUser(row, schema);
  if (user.activeDeviceId && deviceId && user.activeDeviceId !== deviceId) {
    return { ok: false, status: "error", code: "DEVICE_LOCKED", message: "Device lock mismatch." };
  }
  const ts = nowStr();
  setCellIfPresent(sheet, rowIndex, schema.portalSessionActive, portalActive ? "true" : "false");
  setCellIfPresent(sheet, rowIndex, schema.portalLastUpdated, ts);
  if (activity) {
    setCellIfPresent(sheet, rowIndex, schema.lastActivity, activity + " (" + ts + ")");
  }
  return {
    ok: true,
    status: "success",
    code: "OK",
    message: "Portal status recorded.",
    user: rowToUser(sheet.getRange(rowIndex, 1, 1, schema.colCount).getValues()[0], schema)
  };
}

function verifyAdmin(body) {
  const adminId = String(body.adminId || body.admin_id || "").trim();
  const adminPass = String(body.adminPassword || body.admin_password || "").trim();
  return adminId === ADMIN_ID && adminPass === ADMIN_PASSWORD;
}

function handleAdminLogin(body) {
  if (!verifyAdmin(body)) {
    return { ok: false, status: "error", code: "UNAUTHORIZED", message: "Invalid Admin ID or Password." };
  }
  return { ok: true, status: "success", code: "ADMIN_OK", message: "Admin verified." };
}

function computeStats(users) {
  const today = todayStr();
  let activeUsers = 0;
  let inactiveUsers = 0;
  let expiredUsers = 0;
  let loggedInAppUsers = 0;
  let activePortalUsers = 0;

  for (let i = 0; i < users.length; i++) {
    const u = users[i];
    const isActive = u.status === "active";
    const isExpired = !u.expiryDate || today > u.expiryDate;
    if (!isActive) {
      inactiveUsers++;
    } else if (isExpired) {
      expiredUsers++;
    } else {
      activeUsers++;
    }
    if (u.appLoggedIn && isActive && !isExpired) {
      loggedInAppUsers++;
    }
    if (u.portalSessionActive && isActive && !isExpired) {
      activePortalUsers++;
    }
  }

  return {
    totalGeneralUsers: users.length,
    activeUsers: activeUsers,
    inactiveUsers: inactiveUsers,
    expiredUsers: expiredUsers,
    loggedInAppUsers: loggedInAppUsers,
    activePortalUsers: activePortalUsers
  };
}

function handleAdminListUsers(body) {
  if (!verifyAdmin(body)) {
    return { ok: false, status: "error", code: "UNAUTHORIZED", message: "Unauthorized admin credentials." };
  }
  const sheet = getUsersSheet();
  const schema = getSheetSchema(sheet);
  const lastRow = sheet.getLastRow();
  const users = [];
  if (lastRow > 1) {
    const values = sheet.getRange(2, 1, lastRow - 1, schema.colCount).getValues();
    for (let i = 0; i < values.length; i++) {
      if (!values[i][schema.userId] && !values[i][schema.phone]) continue;
      users.push(rowToUser(values[i], schema));
    }
  }
  return {
    ok: true,
    status: "success",
    code: "OK",
    message: "Loaded " + users.length + " user(s).",
    users: users,
    stats: computeStats(users)
  };
}

function resolveTargetUserId(body) {
  return String(
    body.targetUserId ||
    body.target_user_id ||
    body.userId ||
    body.user_id ||
    body.id ||
    body.identifier ||
    body.phone_number ||
    body.phone ||
    body.mobile ||
    ""
  ).trim();
}

function findTargetUserRow(sheet, schema, body) {
  const primary = resolveTargetUserId(body);
  let found = primary ? findUserRow(sheet, schema, primary) : null;
  if (!found) {
    const phoneFallback = String(body.phone_number || body.phone || body.mobile || "").trim();
    if (phoneFallback && phoneFallback !== primary) {
      found = findUserRow(sheet, schema, phoneFallback);
    }
  }
  return { found: found, targetLabel: primary || String(body.phone_number || body.phone || "").trim() };
}

function handleAdminActivateUser(body) {
  if (!verifyAdmin(body)) {
    return { ok: false, status: "error", code: "UNAUTHORIZED", message: "Unauthorized admin credentials." };
  }
  const sheet = getUsersSheet();
  const schema = getSheetSchema(sheet);
  const lookup = findTargetUserRow(sheet, schema, body);
  if (!lookup.found) {
    return { ok: false, status: "error", code: "NOT_FOUND", message: "User not found: " + lookup.targetLabel };
  }
  const found = lookup.found;

  const providedExpiry = formatDateValue(body.expiryDate || body.expiry_date || "");
  const expiry = (/^\d{4}-\d{2}-\d{2}$/.test(providedExpiry) && providedExpiry >= todayStr())
    ? providedExpiry
    : addDaysStr(30);
  const ts = nowStr();
  sheet.getRange(found.rowIndex, schema.status + 1).setValue("active");
  sheet.getRange(found.rowIndex, schema.expiryDate + 1).setNumberFormat("@").setValue(expiry);
  sheet.getRange(found.rowIndex, schema.activeDeviceId + 1).setValue("");
  setCellIfPresent(sheet, found.rowIndex, schema.lastActivity, "Activated 30d & device unlocked by Admin (" + ts + ")");

  const updatedRow = sheet.getRange(found.rowIndex, 1, 1, schema.colCount).getValues()[0];
  const updatedUser = rowToUser(updatedRow, schema);
  return {
    ok: true,
    status: "success",
    code: "ACTIVATED",
    message: "Activated " + (updatedUser.userId || updatedUser.phone) + " until " + expiry + " (device lock reset)",
    user: updatedUser
  };
}

function handleAdminDeactivateUser(body) {
  if (!verifyAdmin(body)) {
    return { ok: false, status: "error", code: "UNAUTHORIZED", message: "Unauthorized admin credentials." };
  }
  const sheet = getUsersSheet();
  const schema = getSheetSchema(sheet);
  const lookup = findTargetUserRow(sheet, schema, body);
  if (!lookup.found) {
    return { ok: false, status: "error", code: "NOT_FOUND", message: "User not found: " + lookup.targetLabel };
  }
  const found = lookup.found;

  const ts = nowStr();
  sheet.getRange(found.rowIndex, schema.status + 1).setValue("inactive");
  setCellIfPresent(sheet, found.rowIndex, schema.appLoggedIn, "false");
  setCellIfPresent(sheet, found.rowIndex, schema.sessionToken, "");
  setCellIfPresent(sheet, found.rowIndex, schema.lastActivity, "Deactivated by Admin (" + ts + ")");

  const updatedRow = sheet.getRange(found.rowIndex, 1, 1, schema.colCount).getValues()[0];
  const updatedUser = rowToUser(updatedRow, schema);
  return {
    ok: true,
    status: "success",
    code: "DEACTIVATED",
    message: "Deactivated " + (updatedUser.userId || updatedUser.phone) + ".",
    user: updatedUser
  };
}

function handleAdminEditUser(body) {
  if (!verifyAdmin(body)) {
    return { ok: false, status: "error", code: "UNAUTHORIZED", message: "Unauthorized admin credentials." };
  }
  const sheet = getUsersSheet();
  const schema = getSheetSchema(sheet);
  const lookup = findTargetUserRow(sheet, schema, body);
  if (!lookup.found) {
    return { ok: false, status: "error", code: "NOT_FOUND", message: "User not found: " + lookup.targetLabel };
  }
  const found = lookup.found;

  const rawPhone = body.phone !== undefined ? body.phone : body.phone_number;
  const newPhone = rawPhone !== undefined ? normalizePhone(rawPhone) : "";
  if (rawPhone !== undefined && (!newPhone || newPhone.length < 10)) {
    return { ok: false, status: "error", code: "INVALID_PHONE", message: "Enter a valid 10-digit phone number." };
  }

  const lastRow = sheet.getLastRow();
  if (lastRow > 1 && newPhone) {
    const values = sheet.getRange(2, 1, lastRow - 1, schema.colCount).getValues();
    for (let i = 0; i < values.length; i++) {
      if (i + 2 === found.rowIndex) continue;
      if (normalizePhone(values[i][schema.phone]) === newPhone) {
        return { ok: false, status: "error", code: "PHONE_EXISTS", message: "Another user already uses phone " + newPhone };
      }
    }
  }

  const ts = nowStr();
  if (newPhone) {
    sheet.getRange(found.rowIndex, schema.phone + 1).setNumberFormat("@").setValue(newPhone);
  }
  if (schema.fullName >= 0 && (body.fullName !== undefined || body.full_name !== undefined)) {
    const newFullName = String(body.fullName !== undefined ? body.fullName : body.full_name).trim();
    sheet.getRange(found.rowIndex, schema.fullName + 1).setValue(newFullName);
  }
  if (schema.username >= 0 && (body.username !== undefined || body.user_name !== undefined)) {
    const newUsername = String(body.username !== undefined ? body.username : body.user_name).trim();
    sheet.getRange(found.rowIndex, schema.username + 1).setNumberFormat("@").setValue(newUsername);
  }
  setCellIfPresent(sheet, found.rowIndex, schema.lastActivity, "Profile updated by Admin (" + ts + ")");

  const updatedRow = sheet.getRange(found.rowIndex, 1, 1, schema.colCount).getValues()[0];
  const updatedUser = rowToUser(updatedRow, schema);
  return {
    ok: true,
    status: "success",
    code: "USER_UPDATED",
    message: "Updated details for " + (updatedUser.userId || updatedUser.phone),
    user: updatedUser
  };
}

function handleAdminResetPassword(body) {
  if (!verifyAdmin(body)) {
    return { ok: false, status: "error", code: "UNAUTHORIZED", message: "Unauthorized admin credentials." };
  }
  const newPassword = String(body.newPassword || body.new_password || body.password || "").trim();
  if (!newPassword || newPassword.length < 4) {
    return { ok: false, status: "error", code: "WEAK_PASSWORD", message: "New password must be at least 4 characters." };
  }

  const sheet = getUsersSheet();
  const schema = getSheetSchema(sheet);
  const lookup = findTargetUserRow(sheet, schema, body);
  if (!lookup.found) {
    return { ok: false, status: "error", code: "NOT_FOUND", message: "User not found: " + lookup.targetLabel };
  }
  const found = lookup.found;

  const ts = nowStr();
  sheet.getRange(found.rowIndex, schema.password + 1).setValue(hashPassword(newPassword));
  setCellIfPresent(sheet, found.rowIndex, schema.appLoggedIn, "false");
  setCellIfPresent(sheet, found.rowIndex, schema.sessionToken, "");
  setCellIfPresent(sheet, found.rowIndex, schema.lastActivity, "App password reset by Admin (" + ts + ")");

  const updatedRow = sheet.getRange(found.rowIndex, 1, 1, schema.colCount).getValues()[0];
  const updatedUser = rowToUser(updatedRow, schema);
  return {
    ok: true,
    status: "success",
    code: "PASSWORD_RESET",
    message: "App password securely reset for " + (updatedUser.userId || updatedUser.phone),
    user: updatedUser
  };
}

function handleAdminDeleteUser(body) {
  if (!verifyAdmin(body)) {
    return { ok: false, status: "error", code: "UNAUTHORIZED", message: "Unauthorized admin credentials." };
  }
  const sheet = getUsersSheet();
  const schema = getSheetSchema(sheet);
  const lookup = findTargetUserRow(sheet, schema, body);
  if (!lookup.found) {
    return { ok: false, status: "error", code: "NOT_FOUND", message: "User not found: " + lookup.targetLabel };
  }
  const found = lookup.found;
  const deletedUser = rowToUser(found.row, schema);
  sheet.deleteRow(found.rowIndex);
  return {
    ok: true,
    status: "success",
    code: "USER_DELETED",
    message: "Deleted account " + (deletedUser.userId || deletedUser.phone)
  };
}

function handleAdminResetDevice(body) {
  if (!verifyAdmin(body)) {
    return { ok: false, status: "error", code: "UNAUTHORIZED", message: "Unauthorized admin credentials." };
  }
  const sheet = getUsersSheet();
  const schema = getSheetSchema(sheet);
  const lookup = findTargetUserRow(sheet, schema, body);
  if (!lookup.found) {
    return { ok: false, status: "error", code: "NOT_FOUND", message: "User not found: " + lookup.targetLabel };
  }
  const found = lookup.found;

  const ts = nowStr();
  sheet.getRange(found.rowIndex, schema.activeDeviceId + 1).setValue("");
  setCellIfPresent(sheet, found.rowIndex, schema.lastActivity, "Device lock reset by Admin (" + ts + ")");

  const updatedRow = sheet.getRange(found.rowIndex, 1, 1, schema.colCount).getValues()[0];
  const updatedUser = rowToUser(updatedRow, schema);
  return {
    ok: true,
    status: "success",
    code: "DEVICE_RESET",
    message: "Device lock cleared for " + (updatedUser.userId || updatedUser.phone),
    user: updatedUser
  };
}

function handleAdminResetPortalSession(body, isForceLogout) {
  if (!verifyAdmin(body)) {
    return { ok: false, status: "error", code: "UNAUTHORIZED", message: "Unauthorized admin credentials." };
  }
  const sheet = getUsersSheet();
  const schema = getSheetSchema(sheet);
  const lookup = findTargetUserRow(sheet, schema, body);
  if (!lookup.found) {
    return { ok: false, status: "error", code: "NOT_FOUND", message: "User not found: " + lookup.targetLabel };
  }
  const found = lookup.found;

  const ts = nowStr();
  if (schema.portalResetVersion >= 0) {
    const currentVersion = toInt(found.row[schema.portalResetVersion], 0);
    setCellIfPresent(sheet, found.rowIndex, schema.portalResetVersion, currentVersion + 1);
  }
  setCellIfPresent(sheet, found.rowIndex, schema.portalSessionActive, "false");
  setCellIfPresent(sheet, found.rowIndex, schema.portalLastUpdated, ts);
  setCellIfPresent(
    sheet,
    found.rowIndex,
    schema.lastActivity,
    (isForceLogout ? "Portal forced logout by Admin (" : "Portal session reset by Admin (") + ts + ")"
  );

  const updatedRow = sheet.getRange(found.rowIndex, 1, 1, schema.colCount).getValues()[0];
  const updatedUser = rowToUser(updatedRow, schema);
  return {
    ok: true,
    status: "success",
    code: isForceLogout ? "PORTAL_LOGGED_OUT" : "PORTAL_SESSION_RESET",
    message: (isForceLogout ? "Forced portal logout" : "Portal session reset") +
      " for " + (updatedUser.userId || updatedUser.phone) + ".",
    user: updatedUser
  };
}

function jsonOut(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
