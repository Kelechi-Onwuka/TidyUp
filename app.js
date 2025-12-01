let hasEnteredApp = false;

//Connect to backend
const BACKEND_URL = "http://127.0.0.1:8000";


// Welcome / household DOM refs
const welcomeScreen      = document.getElementById("welcome-screen");
const appMain            = document.getElementById("app-main");
const welcomeCreateBtn   = document.getElementById("welcome-create");
const welcomeJoinBtn     = document.getElementById("welcome-join");
const createHouseholdBtn = document.getElementById("create-household");
const joinHouseholdBtn   = document.getElementById("join-household");
const showCodeBtn = document.getElementById("show-code");

async function createHousehold() {
    const res = await fetch(`${BACKEND_URL}/households`, { method: "POST", credentials: "include" });
    const data = await res.json();
  
    householdId = data.id;
    localStorage.setItem("tidyup.householdId", householdId);
  
    alert(`Household created! Share this join code with roommates: ${data.join_code}`);
  }
  
  async function joinHousehold() {
  const code = prompt("Enter your 6-digit join code");
  if (!code) return;

  try {
    const res = await fetch(`${BACKEND_URL}/join?code=${encodeURIComponent(code)}`, {
      method: "POST",
      credentials: "include",   // send + store cookie
    });

    if (!res.ok) {
      alert("Invalid code");
      return;
    }

    const data = await res.json();
    householdId = data.id;
    localStorage.setItem("tidyup.householdId", householdId);

    // Pull the shared state (roommates, chores, etc.) from backend
    await pullFromBackend();
    saveState(state);

    // Re-render UI with the shared data
    renderRoommates();
    renderChores();
    renderAssignments();
    renderCountdown();

    alert("Joined successfully!");
    showApp();   // switch off the welcome screen
  } catch (e) {
    console.error("joinHousehold error", e);
    alert("Joining failed: " + e);   // 👈 show the real message
  }
}


// ---------- Storage ----------
const KEY = "tidyup.v2"; // bump version to avoid old format collisions
function loadState(){
    const raw = localStorage.getItem(KEY);
    if(!raw) return { roommates: [], chores: [], startEpoch: null, doneByWeek: {} };
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
function saveState(state){ localStorage.setItem(KEY, JSON.stringify(state)); }

// ---------- Time helpers ----------
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function nextSunday1159(now = new Date()){
    const d = new Date(now);
    const dow = d.getDay(); // 0=Sun..6=Sat
    const daysToAdd = (7 - dow) % 7;
    const candidate = new Date(d.getFullYear(), d.getMonth(), d.getDate() + daysToAdd, 23, 59, 0, 0);
    return (candidate <= d) ? new Date(candidate.getTime() + WEEK_MS) : candidate;
}
function prevSunday1159(now = new Date()){
    const d = new Date(now);
    const dow = d.getDay();
    const sunday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - dow, 23, 59, 0, 0);
    return (sunday > now) ? new Date(sunday.getTime() - WEEK_MS) : sunday;
}
function weeksSinceStart(now, startEpoch){
    return Math.floor((now.getTime() - startEpoch) / WEEK_MS);
}
function currentWeekKey(startEpoch){
    return String(weeksSinceStart(new Date(), startEpoch)); // "0", "1", ...
}
function nextBoundary(now, startEpoch){
    const w = weeksSinceStart(now, startEpoch);
    return new Date(startEpoch + (w + 1) * WEEK_MS);
}

// ---------- Rotation ----------
function computeAssignments(roommates, chores, startEpoch){
    if (!roommates.length || !chores.length) return [];
    const rotation = Math.floor((Date.now() - startEpoch) / WEEK_MS);
    const n = roommates.length;

    // positive modulo so (i + rotation) never produces a negative index
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
const roommateForm = document.getElementById("roommate-form");
const roommateName = document.getElementById("roommate-name");
const roommateList = document.getElementById("roommate-list");

const choreForm = document.getElementById("chore-form");
const choreName = document.getElementById("chore-name");
const choreDetails = document.getElementById("chore-details");
const choreList = document.getElementById("chore-list");

const assignmentsDiv = document.getElementById("assignments");
const countdownText = document.getElementById("countdown-text");

const enableNotifsBtn = document.getElementById("enable-notifs");
const downloadIcsBtn  = document.getElementById("download-ics");
const rotateNowBtn    = document.getElementById("rotate-now");
const clearAllBtn     = document.getElementById("clear-all");
const resetStartBtn   = document.getElementById("reset-start");

/// ---------- State ----------
let state = loadState();
let householdId = localStorage.getItem("tidyup.householdId");

// Create household on first load if missing
async function ensureHousehold() {
    if (householdId) return householdId;
    const res = await fetch(`${BACKEND_URL}/households`, { 
        method: "POST",
        credentials: "include",   // <-- ADD THIS
    });

    const data = await res.json();
    householdId = data.id;
    localStorage.setItem("tidyup.householdId", householdId);

    state = data.state;
    saveState(state);

    syncDataWithBackend();
}

async function pullFromBackend() {
    if (!householdId) return;
    try {
      const res = await fetch(`${BACKEND_URL}/households/${householdId}/state`, {
        credentials: "include"    
      });
  
      if (!res.ok) return;
      const serverState = await res.json();
      state = serverState;
      saveState(state);
    } catch (e) {
      console.warn("pullFromBackend failed", e);
    }
  }
  

  async function syncDataWithBackend() {
    try {
      await fetch(`${BACKEND_URL}/households/${householdId}/state`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",    
        body: JSON.stringify(state),
      });
    } catch (e) {
      console.warn("syncDataWithBackend failed", e);
    }
  }
  

  (function ensurePastStart() {
    const d = new Date();
    const sunday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - d.getDay());
    if (!state.startEpoch || state.startEpoch > Date.now()) {
        state.startEpoch = sunday.getTime();
        saveState(state);
        syncDataWithBackend();
    }
})();
    
//  Screen helpers 

function showApp() {
    // Only hide the welcome screen ONCE
    if (!hasEnteredApp) {
        hasEnteredApp = true;
        if (welcomeScreen) welcomeScreen.classList.add("hidden");
        if (appMain) appMain.classList.remove("hidden");
    }

    // These should run ALWAYS
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
    if (hasEnteredApp) return;  // don't switch screens again

    if (householdId) {
        showApp();
    } else {
        showWelcome();
    }
}

// NEW — Show household join code
if (showCodeBtn) {
    showCodeBtn.addEventListener("click", async () => {
        if (!householdId) {
            alert("No household yet. Create or join one first.");
            return;
        }

        try {
            const res = await fetch(`${BACKEND_URL}/households/${householdId}`, {
                credentials: "include",   // send cookie so require_auth passes
            });

            if (!res.ok) {
                alert("Couldn't fetch join code. Try refreshing the page.");
                return;
            }

            const data = await res.json();
            const code = data.join_code;

            try {
                await navigator.clipboard.writeText(code);
                alert(`Household join code: ${code}\n\n(It's been copied to your clipboard.)`);
            } catch {
                alert(`Household join code: ${code}`);
            }
        } catch (e) {
            console.error("show-code error", e);
            alert("Something went wrong fetching the join code.");
        }
    });
}


//  Renderers 
function renderRoommates(){
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

function renderChores(){
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

function renderAssignments(){
    const weekKey = currentWeekKey(state.startEpoch);
    state.doneByWeek[weekKey] ||= {};
    const doneMap = state.doneByWeek[weekKey];

    const list = computeAssignments(state.roommates, state.chores, state.startEpoch);
    assignmentsDiv.innerHTML = "";

    if (!list.length){
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

    // 🔥 Smooth fade-in whenever assignments update
    assignmentsDiv.classList.remove("fade");
    void assignmentsDiv.offsetWidth;  // force reflow
    assignmentsDiv.classList.add("fade");
}


// Countdown + auto rerender at boundary
function renderCountdown(){
    const now = new Date();
    const next = nextBoundary(now, state.startEpoch);
    const ms = next - now;
    if (ms <= 0){ countdownText.textContent = "Rotating..."; return; }
    const sec = Math.floor(ms / 1000) % 60;
    const min = Math.floor(ms / (60*1000)) % 60;
    const hr  = Math.floor(ms / (60*60*1000)) % 24;
    const day = Math.floor(ms / (24*60*60*1000));
    countdownText.textContent = `${day}d ${hr}h ${min}m ${sec}s`;
}
// --- Welcome screen buttons ---
if (welcomeCreateBtn) {
    welcomeCreateBtn.addEventListener("click", async () => {
      await createHousehold();
      showApp();
    });
  }
  
  if (welcomeJoinBtn) {
    welcomeJoinBtn.addEventListener("click", async () => {
      await joinHousehold();   // joinHousehold itself will call showApp()
    });
  }
  
  // Optional: keep the small buttons in the main UI working too
  if (createHouseholdBtn) {
    createHouseholdBtn.addEventListener("click", async () => {
      await createHousehold();
    });
  }
  
  if (joinHouseholdBtn) {
    joinHouseholdBtn.addEventListener("click", async () => {
      await joinHousehold();
    });
  }
  

// Handlers 
roommateForm.addEventListener("submit", e => {
    e.preventDefault();
    const name = roommateName.value.trim();
    if(!name) return;
    state.roommates.push({ id: crypto.randomUUID(), name });
    saveState(state);
    syncDataWithBackend();
    roommateName.value = "";
    renderRoommates(); renderAssignments();
});
roommateList.addEventListener("click", e => {
    const btn = e.target.closest("button");
    if(!btn) return;
    const idx = parseInt(btn.dataset.index, 10);
    const action = btn.dataset.action;
    if(action === "delete"){
        state.roommates.splice(idx, 1);
    } else if (action === "up" && idx > 0){
        [state.roommates[idx-1], state.roommates[idx]] = [state.roommates[idx], state.roommates[idx-1]];
    } else if (action === "down" && idx < state.roommates.length - 1){
        [state.roommates[idx+1], state.roommates[idx]] = [state.roommates[idx], state.roommates[idx+1]];
    }
    saveState(state);
    syncDataWithBackend();
    renderRoommates(); renderAssignments();
});

choreForm.addEventListener("submit", e => {
    e.preventDefault();
    const name = choreName.value.trim();
    if(!name) return;
    const details = choreDetails.value.trim();
    state.chores.push({ id: crypto.randomUUID(), name, details, freq: "weekly" });
    saveState(state);
    syncDataWithBackend();
    choreName.value = ""; choreDetails.value = "";
    renderChores(); renderAssignments();
});
choreList.addEventListener("click", e => {
    const btn = e.target.closest("button");
    if(!btn) return;
    const idx = parseInt(btn.dataset.index, 10);
    const action = btn.dataset.action;
    if(action === "delete"){
        state.chores.splice(idx, 1);
    } else if (action === "up" && idx > 0){
        [state.chores[idx-1], state.chores[idx]] = [state.chores[idx], state.chores[idx-1]];
    } else if (action === "down" && idx < state.chores.length - 1){
        [state.chores[idx+1], state.chores[idx]] = [state.chores[idx], state.chores[idx+1]];
    }
    saveState(state);
    syncDataWithBackend();
    renderChores(); renderAssignments();
});

// Toggle complete per week
assignmentsDiv.addEventListener("change", e => {
    const cb = e.target.closest('input[type="checkbox"]');
    if(!cb) return;
    const choreId = cb.dataset.chore;
    const weekKey = currentWeekKey(state.startEpoch);
    state.doneByWeek[weekKey] ||= {};
    state.doneByWeek[weekKey][choreId] = cb.checked;
    saveState(state);
    syncDataWithBackend();
    renderAssignments();
});

// Manual rotate NOW (with backend sync)
rotateNowBtn.addEventListener("click", async () => {
    state.startEpoch -= WEEK_MS;
    saveState(state);
    renderAssignments();
    renderCountdown();
  
    try {
      await fetch(`${BACKEND_URL}/households/${householdId}/rotate-now`, {
        method: "POST",
        credentials: "include"    // ✅ add here
      });
      await pullFromBackend();
      renderAssignments();
    } catch (e) {
      console.warn("rotate-now sync failed", e);
    }
  
    syncDataWithBackend();
  });
  

// Clear all data
clearAllBtn.addEventListener("click", () => {
    if(!confirm("Clear all roommates, chores, and rotation start?")) return;
    state = { roommates: [], chores: [], startEpoch: prevSunday1159().getTime(), doneByWeek: {} };
    saveState(state);
    syncDataWithBackend();
    renderRoommates(); renderChores(); renderAssignments(); renderCountdown();
});

// Reset boundary to next Sunday 11:59 PM (does not have to be used often)
resetStartBtn.addEventListener("click", () => {
    state.startEpoch = nextSunday1159().getTime();
    saveState(state);
    syncDataWithBackend();
    renderAssignments(); renderCountdown();
});

// Reminders (browser Notifications) 
let notifTimerId = null;

function scheduleReminder(){
    // Clear old timer
    if (notifTimerId) clearTimeout(notifTimerId);

    // Fire a reminder 1 hour before the flip (or in 10s if close)
    const now = new Date();
    const boundary = nextBoundary(now, state.startEpoch);
    const reminderAt = new Date(boundary.getTime() - 60*60*1000); // -1h
    let ms = reminderAt - now;
    if (ms < 0) ms = Math.max(boundary - now - 2000, 10000); // fallback: 10s or just before flip

    notifTimerId = setTimeout(() => {
        if (Notification.permission === "granted") {
            const body = "Chore rotation time! Check TidyUp for this week’s chores."
            new Notification("TidyUp Reminder", { body });
        }
        // Reschedule for next week
        scheduleReminder();
    }, ms);
}

enableNotifsBtn.addEventListener("click", async () => {
    try{
        const perm = await Notification.requestPermission();
        if (perm === "granted"){
            scheduleReminder();
            alert("Reminders enabled. Keep a TidyUp tab open to receive them.");
        } else {
            alert("Notifications not enabled. Your browser blocked permission.");
        }
    }catch(e){
        alert("Notifications not supported in this browser.");
    }
});

// Calendar (.ics weekly event)
function downloadICS(){
    // Weekly event Sundays 11:59 PM local, forever (you can edit later in calendar)
    // DTSTART must be in local time formatted as YYYYMMDDTHHMMSS
    const first = new Date(state.startEpoch);
    const pad = n => String(n).padStart(2,"0");
    const fmt = d => `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
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
    const blob = new Blob([ics], {type:"text/calendar"});
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "tidyup-rotation.ics";
    document.body.appendChild(a);
    a.click();
    URL.revokeObjectURL(a.href);
    a.remove();
}
downloadIcsBtn.addEventListener("click", downloadICS);

// Ticks 
setInterval(() => {
    renderCountdown();
    const now = new Date();
    const nb = nextBoundary(now, state.startEpoch);
    if (Math.abs(nb - now) < 900) { // within ~0.9s
        // New week => UI recomputes; checkmarks reset automatically by new weekKey
        renderAssignments();
    }
}, 1000);


// Ticks: countdown + auto-recompute at week boundary
setInterval(() => {
    renderCountdown();
    const now = new Date();
    const nb = nextBoundary(now, state.startEpoch);
    if (Math.abs(nb - now) < 900) { // within ~0.9s
        // New week => UI recomputes; checkmarks reset automatically by new weekKey
        renderAssignments();
    }
}, 1000);

// Initial load + backend sync
(async () => {
    // If this browser already has a householdId, load the latest state
    if (householdId) {
        await pullFromBackend();
        saveState(state);   // keep localStorage in sync
    }

    // Decide which screen to show
    initScreens();

    renderRoommates();
renderChores();
renderAssignments();
renderCountdown();

    

    // 🔁 Poll backend every 3s so other browsers' edits show up here
    setInterval(async () => {
        const before = JSON.stringify(state);
        await pullFromBackend();
        if (JSON.stringify(state) !== before) {
            renderRoommates();
            renderChores();
            renderAssignments();
        }
    }, 3000);
})();
