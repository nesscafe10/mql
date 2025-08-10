// ---- Tebak Angka - Vanilla JS with Firebase Realtime DB ----
// Fill your firebaseConfig in the placeholder below.
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyDxpnj7v6svg_XtZy26jN0GZSnKmWz6e9E",
  authDomain: "quiz-f42c3.firebaseapp.com",
  databaseURL:
    "https://quiz-f42c3-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "quiz-f42c3",
  storageBucket: "quiz-f42c3.firebasestorage.app",
  messagingSenderId: "115695496375",
  appId: "1:115695496375:web:d0418e1b8e52a08cc67132",
  measurementId: "G-ZLKY7MJP9K",
};

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
const auth = firebase.auth();
const db = firebase.database();

// ---------- Utilities ----------
const $ = (id) => document.getElementById(id);
const now = () => Date.now();

// ---------- Admin defaults ----------
const ADMIN_EMAIL = "selimau.wen9.net@gmail.com";
const ADMIN_PASS = "admin123";
const SESSION_PATH = "currentSession"; // single session simple model

// ---------- INDEX (login/register) ----------
if (
  window.location.pathname.endsWith("index.html") ||
  window.location.pathname === "/"
) {
  // Elements
  const showRegister = $("show-register");
  const showLogin = $("show-login");
  const loginForm = $("login-form");
  const registerForm = $("register-form");
  const btnLogin = $("btn-login");
  const btnRegister = $("btn-register");

  showRegister.addEventListener("click", (e) => {
    e.preventDefault();
    loginForm.classList.add("hidden");
    registerForm.classList.remove("hidden");
  });
  showLogin.addEventListener("click", (e) => {
    e.preventDefault();
    registerForm.classList.add("hidden");
    loginForm.classList.remove("hidden");
  });

  // Auto create admin account if not exist (attempt sign-in, else create)
  async function ensureAdmin() {
    try {
      await auth.signInWithEmailAndPassword(ADMIN_EMAIL, ADMIN_PASS);
      // immediately sign out; admin will sign in later explicitly
      await auth.signOut();
    } catch (err) {
      // create admin
      try {
        const u = await auth.createUserWithEmailAndPassword(
          ADMIN_EMAIL,
          ADMIN_PASS
        );
        const uid = u.user.uid;
        await db
          .ref("users/" + uid)
          .set({ nickname: "ADMIN", role: "admin", createdAt: now() });
        await auth.signOut();
        console.log("Admin created");
      } catch (e) {
        console.warn("Admin create skipped:", e.message);
      }
    }
  }
  ensureAdmin();

  btnLogin.addEventListener("click", async () => {
    const email = $("login-email").value.trim();
    const pass = $("login-password").value.trim();
    if (!email || !pass) return alert("Isi email & password");
    try {
      await auth.signInWithEmailAndPassword(email, pass);
      // store user basic data if new
      const u = auth.currentUser;
      const userRef = db.ref("users/" + u.uid);
      userRef.once("value", (snap) => {
        if (!snap.exists()) {
          userRef.set({
            nickname: email.split("@")[0],
            role: "player",
            createdAt: now(),
          });
        }
      });
    } catch (err) {
      alert("Login error: " + err.message);
    }
  });

  btnRegister.addEventListener("click", async () => {
    const email = $("reg-email").value.trim();
    const nickname = $("reg-nickname").value.trim();
    const pass = $("reg-password").value.trim();
    if (!email || !nickname || !pass) return alert("Isi semua field");
    try {
      const res = await auth.createUserWithEmailAndPassword(email, pass);
      const uid = res.user.uid;
      await db
        .ref("users/" + uid)
        .set({ nickname, role: "player", createdAt: now() });
      // auto login done by firebase
    } catch (err) {
      alert("Register error: " + err.message);
    }
  });
}

// ---------- GAME PAGE ----------
if (window.location.pathname.endsWith("game.html")) {
  let currentUser = null;
  const nicknameDisplay = $("nickname-display");
  const btnLogout = $("btn-logout");
  const btnStart = $("btn-start");
  const btnEnd = $("btn-end");
  const btnCancel = $("btn-cancel");
  const adminControls = $("admin-controls");
  const sessionStatus = $("session-active");
  const timerEl = $("timer");
  const progressBar = $("progress-bar");
  const randomDigitsEl = $("random-digits");
  const digitsCountEl = $("digits-count");
  const guessInput = $("guess-input");
  const btnSubmitGuess = $("btn-submit-guess");
  const playersBody = $("players-body");
  const chatWindow = $("chat-window");
  const chatText = $("chat-text");
  const btnSendChat = $("btn-send-chat");

  const sessionRef = db.ref(SESSION_PATH);
  const playersRef = db.ref("players");
  const chatRef = () => db.ref("chat");

  // Session model:
  // currentSession: { active: bool, startedAt: timestamp, intervalMs: number, digits: {ts:digit}, lastGeneratedAt: timestamp }
  function setSession(val) {
    return sessionRef.set(val);
  }
  function updateSession(val) {
    return sessionRef.update(val);
  }

  auth.onAuthStateChanged(async (user) => {
    if (!user) return;
    currentUser = user;
    const userSnap = await db.ref("users/" + user.uid).once("value");
    const userData = userSnap.val() || {
      nickname: user.email.split("@")[0],
      role: "player",
    };
    nicknameDisplay.textContent = userData.nickname;
    // display admin controls if admin
    if (userData.role === "admin" || user.email === ADMIN_EMAIL) {
      adminControls.classList.remove("hidden");
    } else {
      adminControls.classList.add("hidden");
    }

    // ensure player entry exists
    playersRef
      .child(user.uid)
      .update({ nickname: userData.nickname, uid: user.uid });

    // Listen session
    sessionRef.on("value", (snap) => {
      const s = snap.val();
      if (s && s.active) {
        sessionStatus.textContent = "Berjalan";
        // show digits count and last digit
        const digits = s.digits || {};
        const arr = Object.values(digits);
        digitsCountEl.textContent = arr.length;
        randomDigitsEl.textContent = arr.length ? arr[arr.length - 1] : "-";
        startTimer(s);
      } else {
        sessionStatus.textContent = "Tidak berjalan";
        timerEl.textContent = "--:--";
        progressBar.style.width = "0%";
        randomDigitsEl.textContent = "-";
        digitsCountEl.textContent = "0";
      }
    });

    // Listen players
    playersRef.on("value", (snap) => {
      const players = snap.val() || {};
      playersBody.innerHTML = "";
      Object.values(players)
        .sort((a, b) => (b.reward || 0) - (a.reward || 0))
        .forEach((p) => {
          // don't show admin in table
          if (p.role === "admin" || p.nickname === "ADMIN") return;
          const tr = document.createElement("tr");
          tr.innerHTML = `<td>${p.nickname || p.uid}</td><td>${
            p.number || "-"
          }</td><td>${p.reward || 0}</td>`;
          playersBody.appendChild(tr);
        });
    });

    // Listen chat (global)
    chatRef()
      .child("messages")
      .limitToLast(200)
      .on("child_added", (snap) => {
        const m = snap.val();
        addChatBubble(m);
      });
  });

  btnLogout.addEventListener("click", async () => {
    if (!confirm("Logout?")) return;
    // remove player's presence
    if (currentUser) {
      await playersRef.child(currentUser.uid).update({ online: false });
    }
    await auth.signOut();
    window.location = "index.html";
  });

  // Admin actions
  btnStart.addEventListener("click", async () => {
    const nowTs = Date.now();
    // start session with interval 10 minutes (600000 ms)
    const intervalMs = 600000;
    const initial = {
      active: true,
      startedAt: nowTs,
      intervalMs,
      digits: {},
      lastGeneratedAt: 0,
    };
    await setSession(initial);
    // immediately generate first digit
    await generateDigit();
  });
  btnEnd.addEventListener("click", async () => {
    if (!confirm("Akhiri sesi sekarang? Semua pemain akan keluar.")) return;
    await setSession({ active: false, endedAt: Date.now() });
    // optional: logout players by clearing players entries (simple approach)
    await playersRef.once("value").then((snap) => {
      snap.forEach((ch) => {
        ch.ref.update({ number: null, reward: 0 });
      });
    });
  });
  btnCancel.addEventListener("click", async () => {
    if (!confirm("Batalkan sesi? Semua peserta akan logout.")) return;
    await setSession({ active: false, canceledAt: Date.now() });
    // sign out all players - here we clear players and mark for clients to redirect
    await playersRef.once("value").then((snap) => {
      snap.forEach((ch) => {
        ch.ref.update({ number: null, reward: 0 });
      });
    });
  });

  // generateDigit picks 4-digit random number and pushes to session.digits with timestamp
  async function generateDigit() {
    const digit = String(Math.floor(Math.random() * 10000)).padStart(4, "0");
    const ts = Date.now();
    await sessionRef.child("digits").push(digit);
    await sessionRef.update({ lastGeneratedAt: ts });
    // after pushing, compute rewards for players
    await computeRewardsForDigit(digit);
  }

  // compute reward: Rp5000 per matching digit (counting duplicates)
  async function computeRewardsForDigit(digit) {
    const playersSnap = await playersRef.once("value");
    playersSnap.forEach((pSnap) => {
      const p = pSnap.val();
      if (!p || !p.number) return;
      const guess = String(p.number).padStart(4, "0");
      // compute matches (count duplicates)
      let matches = 0;
      const arrSys = digit.split("");
      const arrGuess = guess.split("");
      // count matches by checking each guess digit against sys digits, counting each match only once per occurrence in sys
      const sysCounts = {};
      arrSys.forEach((d) => (sysCounts[d] = (sysCounts[d] || 0) + 1));
      arrGuess.forEach((d) => {
        if (sysCounts[d] && sysCounts[d] > 0) {
          matches += 1;
          sysCounts[d] -= 1;
        }
      });
      const reward = matches * 5000;
      if (reward > 0) {
        const prev = pSnap.val().reward || 0;
        pSnap.ref.update({ reward: prev + reward });
      }
    });
  }

  // submit guess (only once per player per session)
  btnSubmitGuess.addEventListener("click", async () => {
    const val = guessInput.value.trim();
    if (!/^\d{4}$/.test(val))
      return alert("Masukkan 4 digit angka (contoh: 0365)");
    const user = auth.currentUser;
    if (!user) return alert("Not logged in");
    // check if already submitted for this session
    const pRef = playersRef.child(user.uid);
    const snap = await pRef.once("value");
    const data = snap.val() || {};
    if (data.number) return alert("Kamu sudah submit untuk sesi ini");
    await pRef.update({
      number: val,
      submittedAt: Date.now(),
      nickname: data.nickname || "Player",
    });
    alert("Tebakan diterima!");
  });

  // chat
  btnSendChat.addEventListener("click", async () => {
    const text = chatText.value.trim();
    if (!text) return;
    const u = auth.currentUser;
    const userSnap = await db.ref("users/" + u.uid).once("value");
    const nick =
      (userSnap.val() && userSnap.val().nickname) || u.email.split("@")[0];
    const payload = { uid: u.uid, nickname: nick, text, ts: Date.now() };
    await chatRef().child("messages").push(payload);
    chatText.value = "";
  });

  function addChatBubble(m) {
    const div = document.createElement("div");
    const isMe = auth.currentUser && m.uid === auth.currentUser.uid;
    div.className = "chat-bubble " + (isMe ? "me" : "other");
    div.innerHTML = `<strong>${m.nickname}</strong><div>${escapeHtml(
      m.text
    )}</div><div class="muted small">${new Date(
      m.ts
    ).toLocaleTimeString()}</div>`;
    chatWindow.appendChild(div);
    chatWindow.scrollTop = chatWindow.scrollHeight;
  }

  function escapeHtml(s) {
    return String(s).replace(
      /[&<>"]/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])
    );
  }

  // Timer logic: whenever session changes we compute remaining to next generation
  let timerInterval = null;
  function startTimer(session) {
    if (!session || !session.active) return;
    const intervalMs = session.intervalMs || 600000;
    const last = session.lastGeneratedAt || session.startedAt || Date.now();
    // compute next generation time
    const next = last + intervalMs;
    if (timerInterval) clearInterval(timerInterval);
    function tick() {
      const nowTs = Date.now();
      let diff = Math.max(0, next - nowTs);
      const mins = Math.floor(diff / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      timerEl.textContent = `${String(mins).padStart(2, "0")}:${String(
        secs
      ).padStart(2, "0")}`;
      const pct = Math.min(
        100,
        Math.round(((intervalMs - diff) / intervalMs) * 100)
      );
      progressBar.style.width = pct + "%";
      if (diff <= 0) {
        // request server to generate new digit (any client can do it)
        generateDigit();
      }
    }
    tick();
    timerInterval = setInterval(tick, 1000);
  }

  // Redirect logic if session canceled/ended: simple approach - listen session and if not active, show alert and optionally sign out client
  sessionRef.on("value", (snap) => {
    const s = snap.val();
    if (s && !s.active && (s.canceledAt || s.endedAt)) {
      // auto-logout all players
      // We DON'T forcibly signout the user from client (can't do from server), but we can clear their player data and redirect to login
      setTimeout(async () => {
        alert("Sesi berakhir. Kamu akan diarahkan ke login.");
        try {
          await auth.signOut();
        } catch (e) {}
        window.location = "index.html";
      }, 1500);
    }
  });

  // Simple presence: mark online
  auth.onAuthStateChanged((user) => {
    if (user) {
      playersRef.child(user.uid).update({ online: true });
      // remove online when disconnect
      db.ref("players/" + user.uid + "/online")
        .onDisconnect()
        .set(false);
    }
  });
}
