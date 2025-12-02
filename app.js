let hasEnteredApp = false;

// No backend on GitHub Pages — everything is localStorage only
const BACKEND_URL = null;

// ---------- Storage ----------
const KEY = "tidyup.v2"; // bump version to avoid old format collisions
function loadState() {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { roommates: [], chores: [], startEpoch: null, doneByWeek: {} };
    try {
        const s = JSON.parse(raw);
        // ensure new fields
        s.doneByWeek ||= {};
        s.chores ||= [];
        s.roommates ||= [];
        return s;
    } catch {
        return { roommates: [], chores: [], startEpoch: null, doneByWeek: {} };
    }
}
function saveState(state) { localStorage.setItem(KEY, JSON.stringify(state)); }

// ---------- Time helpers ----------
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function nextSunday1159(now = new Date()) {
    const d = new Date(now);
    const dow = d.getDay(); // 0=Sun..6=Sat
    const daysToAdd = (7 - dow) % 7;
    const candidate = new Date(d.getFullYear(), d.getMonth(), d.getDate() + daysToAdd, 23, 59, 0, 0);
    return (candidate <= d) ? new Date(candidate.getTime() + WEEK_MS) : candidate;
}
function prevSunday1159(now = new Date()) {
    const d = new Date(now);
    const dow = d.getDay();
    const sunday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - dow, 23, 59, 0, 0);
    return (sunday > now) ? new Date(sunday.getTime() - WEEK_MS) : sunday;
}
function weeksSinceStart(now, startEpoch) {
    return Math.floor((now.getTime() - startEpoch) / WEEK_MS);
}
function currentWeekKey(startEpoch) {
    return String(weeksSinceStart(new Date(), startEpoch)); // "0", "1", ...
}
function nextBoundary(now, startEpoch) {
    const w = weeksSinceStart(now, startEpoch);
    return new Date(startEpoch + (w + 1) * WEEK_MS);
}

// ---------- Rotation ----------
function computeAssignments(roommates, chores, startEpoch) {
    if (!roommates.length || !chores.length) return [];
    const rotation = Math.floor((Date.now() - startEpoch) / WEEK_MS);
    const n = roommates.length;

    const posMod = (a, m) => ((a % m) + m) % m;

    return chores.map((ch, i) => {
        const idx = posMod(i + rotation, n);
        const r = roommates[idx];
        return {
            choreId: ch.id,
            chore: ch.name,
            details: ch.details || "",
            roommateId: r?.id,
            roommate: r?.name ?? "—"
        };
    });
}

// ---------- DOM refs ----------
const welcomeScreen      = document.getElementById("welcome-screen");
const appMain            = document.getElementById("app-main");
const welcomeCreateBtn   = document.getElementById("welcome-create");
const welcomeJoinBtn     = document.getElementById("welcome-join");
const createHouseholdBtn = document.getElementById("create-household");
const joinHouseholdBtn   = document.getElementById("join-household");
const showCodeBtn        = document.getElementById("show-code");

const roommateForm   = document.getElementById("roommate-form");
const roommateName   = document.getElementById("roommate-name");
const roommateList   = document.getElementById("roommate-list");
const choreForm      = document.getElementById("chore-form");
const choreName      = document.getElementById("chore-name");
const choreDetails   = document.getElementById("chore-details");
const choreList      = document.getElementById("chore-list");
const assignmentsDiv = document.getElementById("assignments");
const countdownText  = document.getElementById("countdown-text");

const enableNotifsBtn = document.getElementById("enable-notifs");
const downloadIcsBtn  = document.getElementById("download-ics");
const rotateNowBtn    = document.getElementById("rotate-now");
const clearAllBtn     = document.getElementById("clear-all");
const resetStartBtn   = document.getElementById("reset-start");

// ---------- State ----------
let state = loadState();
let householdId = localStorage.getItem("tidyup.householdId");
let joinCode = localStorage.getItem("tidyup.joinCode");

// ---------- Household helpers (frontend-only demo) ----------
function ensureStartEpoch() {
    const d = new Date();
    const sunday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - d.getDay(), 23, 59, 0, 0);
    if (!state.startEpoch || state.startEpoch > Date.now()) {
        state.startEpoch = sunday.getTime();
        saveState(state);
    }
}

// Create a local-only household + join code
function createHousehold() {
    if (!householdId) {
        householdId = crypto.randomUUID();
        localStorage.setItem("tidyup.householdId", householdId);
    }
    if (!joinCode) {
        joinCode = householdId.slice(0, 6).toUpperCase();
        localStorage.setItem("tidyup.joinCode", joinCode);
    }

    alert(`Household created! Share this join code (single-device demo): ${joinCode}`);
    showApp();
}

// Join a household on this same browser using the stored join code
function joinHousehold() {
    const code = prompt("Enter your 6-character join code");
    if (!code) return;

    const stored = localStorage.getItem("tidyup.joinCode");
    if (!stored || stored.toUpperCase() !== code.trim().toUpperCase()) {
        alert("That code doesn't match any household on this device.\n\n(In the hosted demo, join codes work per browser. A full multi-user version would use the optional backend.)");
        return;
    }

    householdId = crypto.randomUUID(); // any non-null ID is fine for local mode
    localStorage.setItem("tidyup.householdId", householdId);

    showApp();
    alert("Joined household!");
}

// Dummy backend sync functions for the GitHub Pages demo
async function pullFromBackend() {
    // No-op: everything lives in localStorage only on GitHub Pages
    return;
}
function syncDataWithBackend() {
    // No-op: placeholder for optional backend version
}

// Ensure startEpoch is sane on load
ensureStartEpoch();

// ---------- Screen helpers ----------
function showApp() {
    if (!hasEnteredApp) {
        hasEnteredApp = true;
        if (welcomeScreen) welcomeScreen.classList.add("hidden");
        if (appMain) appMain.classList.remove("hidden");
    }

    renderRoommates();
    renderChores();
    renderAssignments();
    renderCountdown();
}

function showWelcome() {
    if (welcomeScreen) welcomeScreen.classList.remove("hidden");
    if (appMain) appMain.classList.add("hidden");
}

function initScreens() {
    if (hasEnteredApp) return;

    if (householdId) {
        showApp();
    } else {
        showWelcome();
    }
}

// ---------- Renderers ----------
function renderRoommates() {
    roommateList.innerHTML = "";
    state.roommates.forEach((r, idx) => {
        const li = document.createElement("li");
        li.innerHTML = `
      <span class="tag">${r.name}</span>
      <span class="item-actions">
        <button class="icon-btn" data-action="up" data-index="${idx}">↑</button>
        <button class="icon-btn" data-action="down" data-index="${idx}">↓</button>
        <button class="icon-btn" data-action="delete" data-index="${idx}">Delete</button>
      </span>
    `;
        roommateList.appendChild(li);
    });
}

function renderChores() {
    choreList.innerHTML = "";
    state.chores.forEach((c, idx) => {
        const hasDetails = c.details && c.details.trim().length > 0;
        const li = document.createElement("li");
        li.innerHTML = `
      <span class="tag">${c.name}${hasDetails ? " — " : ""}<span style="color:#A7B3BE">${hasDetails ? "details" : ""}</span></span>
      <span class="item-actions">
        <button class="icon-btn" data-action="up" data-index="${idx}">↑</button>
        <button class="icon-btn" data-action="down" data-index="${idx}">↓</button>
        <button class="icon-btn" data-action="delete" data-index="${idx}">Delete</button>
      </span>
    `;
        choreList.appendChild(li);
    });
}

function renderAssignments() {
    const weekKey = currentWeekKey(state.startEpoch);
    state.doneByWeek[weekKey] ||= {};
    const doneMap = state.doneByWeek[weekKey];

    const list = computeAssignments(state.roommates, state.chores, state.startEpoch);
    assignmentsDiv.innerHTML = "";

    if (!list.length) {
        assignmentsDiv.innerHTML = `<div class="hint">Add at least one roommate and one chore to see assignments.</div>`;
        return;
    }

    list.forEach(item => {
        const row = document.createElement("div");
        row.className = "assignment";
        if (doneMap[item.choreId]) row.classList.add("done");

        row.innerHTML = `
            <div class="who">${item.roommate}</div>
            <div class="what">${item.chore}</div>
            <div class="actions">
                <label title="Mark complete">
                    <input type="checkbox" ${doneMap[item.choreId] ? "checked" : ""} data-chore="${item.choreId}">
                </label>
            </div>
            ${item.details ? `<div class="details">${item.details}</div>` : ""}
        `;

        assignmentsDiv.appendChild(row);
    });

    // Smooth fade-in whenever assignments update
    assignmentsDiv.classList.remove("fade");
    void assignmentsDiv.offsetWidth;
    assignmentsDiv.classList.add("fade");
}

function renderCountdown() {
    const now = new Date();
    const next = nextBoundary(now, state.startEpoch);
    const ms = next - now;
    if (ms <= 0) { countdownText.textContent = "Rotating..."; return; }
    const sec = Math.floor(ms / 1000) % 60;
    const min = Math.floor(ms / (60 * 1000)) % 60;
    const hr  = Math.floor(ms / (60 * 60 * 1000)) % 24;
    const day = Math.floor(ms / (24 * 60 * 60 * 1000));
    countdownText.textContent = `${day}d ${hr}h ${min}m ${sec}s`;
}

// ---------- Welcome screen buttons ----------
if (welcomeCreateBtn) {
    welcomeCreateBtn.addEventListener("click", () => {
        createHousehold();
    });
}
if (welcomeJoinBtn) {
    welcomeJoinBtn.addEventListener("click", () => {
        joinHousehold();
    });
}
if (createHouseholdBtn) {
    createHouseholdBtn.addEventListener("click", () => {
        createHousehold();
    });
}
if (joinHouseholdBtn) {
    joinHouseholdBtn.addEventListener("click", () => {
        joinHousehold();
    });
}

// Show join code (local-only)
if (showCodeBtn) {
    showCodeBtn.addEventListener("click", () => {
        if (!householdId) {
            alert("No household yet. Create or join one first.");
            return;
        }

        if (!joinCode) {
            joinCode = (householdId.slice(0, 6) || "TIDYUP").toUpperCase();
            localStorage.setItem("tidyup.joinCode", joinCode);
        }

        try {
            navigator.clipboard.writeText(joinCode);
            alert(`Household join code (single-device demo): ${joinCode}\n\n(It has been copied to your clipboard.)`);
        } catch {
            alert(`Household join code (single-device demo): ${joinCode}`);
        }
    });
}

// ---------- Handlers ----------
roommateForm.addEventListener("submit", e => {
    e.preventDefault();
    const name = roommateName.value.trim();
    if (!name) return;
    state.roommates.push({ id: crypto.randomUUID(), name });
    saveState(state);
    syncDataWithBackend();
    roommateName.value = "";
    renderRoommates();
    renderAssignments();
});

roommateList.addEventListener("click", e => {
    const btn = e.target.closest("button");
    if (!btn) return;
    const idx = parseInt(btn.dataset.index, 10);
    const action = btn.dataset.action;
    if (action === "delete") {
        state.roommates.splice(idx, 1);
    } else if (action === "up" && idx > 0) {
        [state.roommates[idx - 1], state.roommates[idx]] = [state.roommates[idx], state.roommates[idx - 1]];
    } else if (action === "down" && idx < state.roommates.length - 1) {
        [state.roommates[idx + 1], state.roommates[idx]] = [state.roommates[idx], state.roommates[idx + 1]];
    }
    saveState(state);
    syncDataWithBackend();
    renderRoommates();
    renderAssignments();
});

choreForm.addEventListener("submit", e => {
    e.preventDefault();
    const name = choreName.value.trim();
    if (!name) return;
    const details = choreDetails.value.trim();
    state.chores.push({ id: crypto.randomUUID(), name, details, freq: "weekly" });
    saveState(state);
    syncDataWithBackend();
    choreName.value = "";
    choreDetails.value = "";
    renderChores();
    renderAssignments();
});

choreList.addEventListener("click", e => {
    const btn = e.target.closest("button");
    if (!btn) return;
    const idx = parseInt(btn.dataset.index, 10);
    const action = btn.dataset.action;
    if (action === "delete") {
        state.chores.splice(idx, 1);
    } else if (action === "up" && idx > 0) {
        [state.chores[idx - 1], state.chores[idx]] = [state.chores[idx], state.chores[idx - 1]];
    } else if (action === "down" && idx < state.chores.length - 1) {
        [state.chores[idx + 1], state.chores[idx]] = [state.chores[idx], state.chores[idx + 1]];
    }
    saveState(state);
    syncDataWithBackend();
    renderChores();
    renderAssignments();
});

// Toggle complete per week
assignmentsDiv.addEventListener("change", e => {
    const cb = e.target.closest('input[type="checkbox"]');
    if (!cb) return;
    const choreId = cb.dataset.chore;
    const weekKey = currentWeekKey(state.startEpoch);
    state.doneByWeek[weekKey] ||= {};
    state.doneByWeek[weekKey][choreId] = cb.checked;
    saveState(state);
    syncDataWithBackend();
    renderAssignments();
});

// Manual rotate NOW (local only)
rotateNowBtn.addEventListener("click", () => {
    state.startEpoch -= WEEK_MS;
    saveState(state);
    renderAssignments();
    renderCountdown();
});

// Clear all data
clearAllBtn.addEventListener("click", () => {
    if (!confirm("Clear all roommates, chores, and rotation start?")) return;
    state = { roommates: [], chores: [], startEpoch: prevSunday1159().getTime(), doneByWeek: {} };
    saveState(state);
    syncDataWithBackend();
    renderRoommates();
    renderChores();
    renderAssignments();
    renderCountdown();
});

// Reset boundary to next Sunday 11:59 PM
resetStartBtn.addEventListener("click", () => {
    state.startEpoch = nextSunday1159().getTime();
    saveState(state);
    syncDataWithBackend();
    renderAssignments();
    renderCountdown();
});

// ---------- Reminders (browser Notifications) ----------
let notifTimerId = null;

function scheduleReminder() {
    if (notifTimerId) clearTimeout(notifTimerId);

    const now = new Date();
    const boundary = nextBoundary(now, state.startEpoch);
    const reminderAt = new Date(boundary.getTime() - 60 * 60 * 1000); // -1h
    let ms = reminderAt - now;
    if (ms < 0) ms = Math.max(boundary - now - 2000, 10000);

    notifTimerId = setTimeout(() => {
        if (Notification.permission === "granted") {
            const body = "Chore rotation time! Check TidyUp for this week’s chores.";
            new Notification("TidyUp Reminder", { body });
        }
        scheduleReminder();
    }, ms);
}

enableNotifsBtn.addEventListener("click", async () => {
    try {
        const perm = await Notification.requestPermission();
        if (perm === "granted") {
            scheduleReminder();
            alert("Reminders enabled. Keep a TidyUp tab open to receive them.");
        } else {
            alert("Notifications not enabled. Your browser blocked permission.");
        }
    } catch (e) {
        alert("Notifications not supported in this browser.");
    }
});

// ---------- Calendar (.ics weekly event) ----------
function downloadICS() {
    const first = new Date(state.startEpoch);
    const pad = n => String(n).padStart(2, "0");
    const fmt = d => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
    const dtstart = fmt(first);
    const ics =
        `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//TidyUp//EN
BEGIN:VEVENT
UID:${crypto.randomUUID()}@tidyup
DTSTAMP:${fmt(new Date())}
DTSTART:${dtstart}
RRULE:FREQ=WEEKLY
SUMMARY:TidyUp — Chore Rotation
DESCRIPTION:Open TidyUp to see this week's assignments and check off chores.
END:VEVENT
END:VCALENDAR`;
    const blob = new Blob([ics], { type: "text/calendar" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "tidyup-rotation.ics";
    document.body.appendChild(a);
    a.click();
    URL.revokeObjectURL(a.href);
    a.remove();
}
downloadIcsBtn.addEventListener("click", downloadICS);

// ---------- Ticks ----------
setInterval(() => {
    renderCountdown();
    const now = new Date();
    const nb = nextBoundary(now, state.startEpoch);
    if (Math.abs(nb - now) < 900) {
        renderAssignments();
    }
}, 1000);

// ---------- Initial load ----------
(async () => {
    await pullFromBackend(); // no-op in demo

    initScreens();

    renderRoommates();
    renderChores();
    renderAssignments();
    renderCountdown();
})();
