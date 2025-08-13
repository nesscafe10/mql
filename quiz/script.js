// ---- Tebak Angka - Vanilla JS with Firebase Realtime DB ----
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
const ADMIN_EMAIL = "Nesscafe@gmail.com";
const ADMIN_PASS = "admin123";
const SESSION_PATH = "currentSession";

// ---------- Helper function for checking if user is admin ----------
function isAdmin(user, userData) {
  return (
    user &&
    (user.email === ADMIN_EMAIL || (userData && userData.role === "admin"))
  );
}

// ---------- Helper function for safe database operations ----------
async function safeDbOperation(
  operation,
  errorMsg = "Database operation failed"
) {
  try {
    return await operation();
  } catch (error) {
    console.error(errorMsg, error);
    if (error.code === "PERMISSION_DENIED") {
      alert(
        "Akses ditolak. Pastikan Anda sudah login dan memiliki permission."
      );
    } else if (error.code === "auth/quota-exceeded") {
      localStorage.setItem("quotaExceeded", Date.now().toString());
      alert("Quota Firebase terlampaui. Tunggu 1 jam lalu coba lagi.");
    } else {
      alert(errorMsg + ": " + error.message);
    }
    throw error;
  }
}

// ---------- Quota Status Checker (hanya untuk registrasi) ----------
function checkQuotaStatus() {
  const quotaExceeded = localStorage.getItem("quotaExceeded");
  if (quotaExceeded) {
    const timeSince = Date.now() - parseInt(quotaExceeded);
    if (timeSince < 3600000) {
      // 1 hour
      const remaining = Math.ceil((3600000 - timeSince) / 60000);
      return false; // Still in cooldown
    } else {
      localStorage.removeItem("quotaExceeded");
    }
  }
  return true; // OK to proceed
}

// ---------- FIXED: New reward calculation function ----------
function calculateReward(playerNumber, systemDigits) {
  if (!playerNumber || !systemDigits || systemDigits.length === 0) return 0;

  const playerStr = String(playerNumber).padStart(4, "0");
  const systemStr = systemDigits.join(""); // Convert array to string

  // Count frequency of each digit in system digits
  const systemCount = {};
  for (let digit of systemStr) {
    systemCount[digit] = (systemCount[digit] || 0) + 1;
  }

  // For each player digit, check if it exists in system and count matches
  let totalMatches = 0;

  for (let i = 0; i < playerStr.length; i++) {
    const playerDigit = playerStr[i];
    const systemFreq = systemCount[playerDigit] || 0;

    if (systemFreq > 0) {
      // This digit exists in system
      // Add matches equal to system frequency (bonus for repeated digits)
      totalMatches += systemFreq;
    }
  }

  const reward = totalMatches * 5000; // ubah reward disini!
  return reward;
}

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

  // Auto create admin account - simplified approach
  async function ensureAdmin() {
    // Skip admin creation entirely if quota was exceeded recently
    const quotaExceeded = localStorage.getItem("quotaExceeded");
    if (quotaExceeded) {
      const timeSince = Date.now() - parseInt(quotaExceeded);
      if (timeSince < 3600000) {
        // 1 hour
        return;
      } else {
        localStorage.removeItem("quotaExceeded");
      }
    }

    // Check if admin creation was already attempted successfully
    const adminCreated = localStorage.getItem("adminCreated");
    if (adminCreated) {
      return;
    }

    try {
      // Only attempt admin creation, not verification
      // If admin already exists, createUser will fail gracefully
      const u = await auth.createUserWithEmailAndPassword(
        ADMIN_EMAIL,
        ADMIN_PASS
      );
      const uid = u.user.uid;
      await safeDbOperation(() =>
        db
          .ref("users/" + uid)
          .set({ nickname: "ADMIN", role: "admin", createdAt: now() })
      );
      await auth.signOut();
      localStorage.setItem("adminCreated", "true");
    } catch (err) {
      if (err.code === "auth/quota-exceeded") {
        localStorage.setItem("quotaExceeded", Date.now().toString());
      } else if (err.code === "auth/email-already-in-use") {
        // Admin already exists - this is fine
        localStorage.setItem("adminCreated", "true");
      }
    }
  }

  // Try to create admin only once
  ensureAdmin();

  btnLogin.addEventListener("click", async () => {
    const email = $("login-email").value.trim();
    const pass = $("login-password").value.trim();
    if (!email || !pass) return alert("Isi email & password");

    // Disable button to prevent multiple clicks
    btnLogin.disabled = true;
    btnLogin.textContent = "Logging in...";

    try {
      // Direct login attempt - no quota pre-check needed for existing users
      const userCredential = await auth.signInWithEmailAndPassword(email, pass);
      const user = userCredential.user;

      // Clear any quota flags on successful login
      localStorage.removeItem("quotaExceeded");

      // Check if user data exists, if not create it
      await safeDbOperation(async () => {
        const userRef = db.ref("users/" + user.uid);
        const snapshot = await userRef.once("value");
        let userData;

        if (!snapshot.exists()) {
          // FIXED: Create new user data with default nickname as email prefix, but this should not happen in normal flow
          userData = {
            nickname: email.split("@")[0], // This is fallback only
            role: email === ADMIN_EMAIL ? "admin" : "player",
            createdAt: now(),
          };
          await userRef.set(userData);
        } else {
          userData = snapshot.val();
          // Force admin role for admin email
          if (email === ADMIN_EMAIL && userData.role !== "admin") {
            userData.role = "admin";
            await userRef.update({ role: "admin" });
          }
        }

        // REMOVED: No longer checking session status for non-admin players during login
        // Allow all players to enter the game regardless of session status
      });
    } catch (err) {
      // Handle specific error types
      if (err.code === "auth/quota-exceeded") {
        localStorage.setItem("quotaExceeded", Date.now().toString());
        alert(
          "Quota Firebase terlampaui sementara. Ini biasanya karena terlalu banyak percobaan. Tunggu 15-30 menit lalu coba lagi."
        );
      } else if (err.code === "auth/user-not-found") {
        alert("Email tidak terdaftar. Silakan daftar terlebih dahulu.");
      } else if (err.code === "auth/wrong-password") {
        alert("Password salah. Periksa kembali password Anda.");
      } else if (err.code === "auth/invalid-email") {
        alert("Format email tidak valid.");
      } else if (err.code === "auth/user-disabled") {
        alert("Akun ini telah dinonaktifkan.");
      } else if (err.code === "auth/too-many-requests") {
        alert(
          "Terlalu banyak percobaan login dari IP ini. Tunggu beberapa menit lalu coba lagi."
        );
      } else if (err.code === "auth/network-request-failed") {
        alert("Koneksi internet bermasalah. Periksa koneksi Anda.");
      } else {
        alert("Login error: " + err.message);
      }
    } finally {
      // Re-enable button
      btnLogin.disabled = false;
      btnLogin.textContent = "Login";
    }
  });

  btnRegister.addEventListener("click", async () => {
    const email = $("reg-email").value.trim();
    const nickname = $("reg-nickname").value.trim();
    const pass = $("reg-password").value.trim();
    if (!email || !nickname || !pass) return alert("Isi semua field");

    // Basic validation
    if (pass.length < 6) return alert("Password minimal 6 karakter");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return alert("Format email tidak valid");

    // Disable button
    btnRegister.disabled = true;
    btnRegister.textContent = "Mendaftar...";

    try {
      const res = await auth.createUserWithEmailAndPassword(email, pass);
      const uid = res.user.uid;

      // Clear quota flags on successful registration
      localStorage.removeItem("quotaExceeded");

      // FIXED: Use actual nickname from form, not email prefix
      const userData = {
        nickname: nickname, // Use the actual nickname from registration form
        role: email === ADMIN_EMAIL ? "admin" : "player",
        createdAt: now(),
      };

      await safeDbOperation(() => db.ref("users/" + uid).set(userData));

      // REMOVED: No longer checking session status for non-admin players during registration
      // Allow all players to register and enter the game regardless of session status

      alert("Registrasi berhasil! Anda akan diarahkan ke game.");
    } catch (err) {
      if (err.code === "auth/quota-exceeded") {
        localStorage.setItem("quotaExceeded", Date.now().toString());
        alert(
          "Quota Firebase terlampaui sementara. Tunggu 15-30 menit lalu coba lagi."
        );
      } else if (err.code === "auth/email-already-in-use") {
        alert("Email sudah terdaftar. Silakan login atau gunakan email lain.");
      } else if (err.code === "auth/weak-password") {
        alert("Password terlalu lemah. Gunakan minimal 6 karakter.");
      } else if (err.code === "auth/invalid-email") {
        alert("Format email tidak valid.");
      } else if (err.code === "auth/too-many-requests") {
        alert(
          "Terlalu banyak percobaan dari IP ini. Tunggu beberapa menit lalu coba lagi."
        );
      } else {
        alert("Register error: " + err.message);
      }
    } finally {
      btnRegister.disabled = false;
      btnRegister.textContent = "Daftar";
    }
  });
}

// ---------- GAME PAGE ----------
if (window.location.pathname.endsWith("game.html")) {
  let currentUser = null;
  let currentUserData = null;
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

  function setSession(val) {
    return safeDbOperation(
      () => sessionRef.set(val),
      "Failed to update session"
    );
  }
  function updateSession(val) {
    return safeDbOperation(
      () => sessionRef.update(val),
      "Failed to update session"
    );
  }

  auth.onAuthStateChanged(async (user) => {
    if (!user) return;
    currentUser = user;

    try {
      // Get user data with proper error handling
      const userSnap = await safeDbOperation(
        () => db.ref("users/" + user.uid).once("value"),
        "Failed to load user data"
      );

      currentUserData = userSnap.val();
      if (!currentUserData) {
        // FIXED: This should rarely happen, but if it does, create with email prefix as fallback
        currentUserData = {
          nickname: user.email.split("@")[0], // Fallback only
          role: user.email === ADMIN_EMAIL ? "admin" : "player",
          createdAt: now(),
        };
        await safeDbOperation(
          () => db.ref("users/" + user.uid).set(currentUserData),
          "Failed to create user data"
        );
      } else {
        // Force admin role for admin email if not already set
        if (user.email === ADMIN_EMAIL && currentUserData.role !== "admin") {
          currentUserData.role = "admin";
          await safeDbOperation(
            () => db.ref("users/" + user.uid).update({ role: "admin" }),
            "Failed to update admin role"
          );
        }
      }

      // FIXED: Always use nickname from database
      nicknameDisplay.textContent = currentUserData.nickname;

      // Show admin controls if admin
      if (isAdmin(user, currentUserData)) {
        adminControls.classList.remove("hidden");
      } else {
        adminControls.classList.add("hidden");

        // REMOVED: No longer checking session status for non-admin users
        // Allow all players to stay in the game regardless of session status
      }

      // FIXED: Ensure player entry exists with correct nickname from database
      await safeDbOperation(
        () =>
          playersRef.child(user.uid).update({
            nickname: currentUserData.nickname, // Use nickname from database
            uid: user.uid,
            online: true,
            role: currentUserData.role,
          }),
        "Failed to update player data"
      );

      // Setup disconnect handler
      db.ref("players/" + user.uid + "/online")
        .onDisconnect()
        .set(false);
    } catch (error) {
      alert("Terjadi error saat memuat data user. Silakan refresh halaman.");
      return;
    }

    // Listen to session changes
    sessionRef.on("value", (snap) => {
      const s = snap.val();
      if (s && s.active) {
        sessionStatus.textContent = "Berjalan";
        updateDisplayFromSession(s);
        updateSubmitButtonState(s); // NEW: Update submit button state
        startTimer(s);
      } else {
        sessionStatus.textContent = "Tidak berjalan / Menunggu";
        timerEl.textContent = "--:--";
        progressBar.style.width = "0%";
        randomDigitsEl.textContent = "-";
        digitsCountEl.textContent = "0";
        updateSubmitButtonState(null); // NEW: Update submit button state
        // Stop timer when session is not active
        if (timerInterval) {
          clearInterval(timerInterval);
          timerInterval = null;
        }
      }
    });

    // Listen to players
    function updatePlayersTable() {
      // Try to get players data with proper error handling
      safeDbOperation(async () => {
        const snap = await playersRef.once("value");
        const players = snap.val();

        // Clear existing table
        playersBody.innerHTML = "";

        if (!players) {
          const tr = document.createElement("tr");
          tr.innerHTML =
            '<td colspan="4" style="text-align: center; color: #64748b;">Belum ada pemain terdaftar</td>';
          playersBody.appendChild(tr);
          return;
        }

        // Convert players object to array
        const playersList = [];
        for (const uid in players) {
          if (players.hasOwnProperty(uid)) {
            const playerData = players[uid];
            playersList.push({
              uid: uid,
              nickname: playerData.nickname || "Unknown", // FIXED: Use nickname from database
              number: playerData.number || null,
              online: playerData.online || false,
              role: playerData.role || "player",
              reward: playerData.reward || 0,
              submittedAt: playerData.submittedAt || null,
            });
          }
        }

        // Sort by reward (highest first), then by submission time
        playersList.sort((a, b) => {
          const rewardDiff = b.reward - a.reward;
          if (rewardDiff !== 0) return rewardDiff;

          // If same reward, sort by submission time (earliest first)
          if (a.submittedAt && b.submittedAt) {
            return a.submittedAt - b.submittedAt;
          }

          // If one has submitted and other hasn't
          if (a.submittedAt && !b.submittedAt) return -1;
          if (!a.submittedAt && b.submittedAt) return 1;

          // Finally sort by nickname
          return a.nickname
            .toLowerCase()
            .localeCompare(b.nickname.toLowerCase());
        });

        // Add each player to table
        playersList.forEach((player, index) => {
          const tr = document.createElement("tr");

          // Status indicator
          const statusIcon = player.online ? "🟢" : "🔴";
          const statusText = player.online ? "Online" : "Offline";

          // Role indicator
          const roleTag =
            player.role === "admin"
              ? ' <span style="background: #fbbf24; color: #92400e; padding: 2px 6px; border-radius: 12px; font-size: 0.7em; font-weight: bold;">ADMIN</span>'
              : "";

          // Format number
          const displayNumber = player.number
            ? String(player.number).padStart(4, "0")
            : "-";

          // Format reward
          const displayReward =
            player.reward > 0 ? player.reward.toLocaleString("id-ID") : "0";

          // Highlight current user
          if (currentUser && player.uid === currentUser.uid) {
            tr.style.backgroundColor = "#0f172a";
            tr.style.fontWeight = "bold";
          }

          tr.innerHTML = `
            <td>${escapeHtml(player.nickname)}${roleTag}</td>
            <td style="font-family: 'Courier New', monospace; text-align: center;">${displayNumber}</td>
            <td style="text-align: right; font-weight: bold; color: ${
              player.reward > 0 ? "#059669" : "#6b7280"
            };">${displayReward}</td>
            <td>${statusIcon} ${statusText}</td>
          `;

          playersBody.appendChild(tr);
        });

        // Add summary footer
        const totalPlayers = playersList.length;
        const onlinePlayers = playersList.filter((p) => p.online).length;
        const playersWithGuess = playersList.filter((p) => p.number).length;
        const totalRewards = playersList.reduce(
          (sum, p) => sum + (p.reward || 0),
          0
        );

        const summaryTr = document.createElement("tr");
        summaryTr.style.backgroundColor = "#0f172a";
        summaryTr.style.borderTop = "2px solid #e2e8f0";
        summaryTr.innerHTML = `
          <td colspan="4" style="text-align: center; padding: 12px; color: #89a8d3ff; font-size: 0.9em;">
            <strong>Total:</strong> ${totalPlayers} pemain | ${onlinePlayers} online | ${playersWithGuess} nomor | Total reward: ${totalRewards.toLocaleString(
          "id-ID"
        )}
          </td>
        `;
        playersBody.appendChild(summaryTr);
      }, "Error loading players data").catch((error) => {
        playersBody.innerHTML = `
          <tr>
            <td colspan="4" style="text-align: center; color: #ef4444; padding: 16px;">
              <div>❌ Gagal memuat data pemain</div>
              <div style="font-size: 0.8em; margin-top: 4px;">Error: ${error.message}</div>
            </td>
          </tr>
        `;
      });
    }

    // Call initially and set up periodic refresh
    updatePlayersTable();

    // Set up real-time listener with error handling
    playersRef.on(
      "value",
      (snap) => {
        try {
          updatePlayersTable();
        } catch (error) {
          // Fallback: try to update manually every 5 seconds if real-time fails
          setInterval(updatePlayersTable, 5000);
        }
      },
      (error) => {
        // Fallback: try to update manually every 5 seconds if real-time fails
        setInterval(updatePlayersTable, 5000);
      }
    );

    // Listen to chat
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
    try {
      if (currentUser) {
        await safeDbOperation(
          () => playersRef.child(currentUser.uid).update({ online: false }),
          "Failed to update logout status"
        );
      }
      await auth.signOut();
      window.location = "index.html";
    } catch (error) {
      // Force redirect anyway
      window.location = "index.html";
    }
  });

  // Admin actions - MODIFIED for new system
  btnStart.addEventListener("click", async () => {
    if (!isAdmin(currentUser, currentUserData)) {
      alert("Hanya admin yang dapat memulai permainan");
      return;
    }

    const nowTs = Date.now();
    const intervalMs = 600000; // ubah waktu disini

    // Generate the full 4-digit number once
    const fullNumber = String(Math.floor(Math.random() * 10000)).padStart(
      4,
      "0"
    );

    const initial = {
      active: true,
      startedAt: nowTs,
      intervalMs,
      fullNumber: fullNumber, // Store the complete 4-digit number
      currentDigitIndex: 0, // Track which digit to show next (0-3)
      revealedDigits: [], // Array to store revealed digits
      nextRevealTime: nowTs + intervalMs, // When to reveal the first digit
      gameComplete: false,
    };

    await setSession(initial);
  });

  btnEnd.addEventListener("click", async () => {
    if (!isAdmin(currentUser, currentUserData)) {
      alert("Hanya admin yang dapat mengakhiri permainan");
      return;
    }
    if (!confirm("Akhiri sesi sekarang? Angka akan direset untuk sesi baru."))
      return;

    try {
      // End session but keep it available for new rounds
      await setSession({ active: false, endedAt: Date.now() });

      // Clear only player submissions and rewards (keep player list)
      const playersSnap = await playersRef.once("value");
      const updates = {};
      playersSnap.forEach((ch) => {
        updates[ch.key + "/number"] = null;
        updates[ch.key + "/reward"] = 0;
        updates[ch.key + "/submittedAt"] = null;
        // Keep: nickname, uid, online, role
      });
      if (Object.keys(updates).length > 0) {
        await safeDbOperation(
          () => playersRef.update(updates),
          "Failed to reset player data"
        );
      }

      alert("Sesi berakhir! Angka telah direset. Anda bisa memulai sesi baru.");
    } catch (error) {
      alert("Gagal mengakhiri sesi: " + error.message);
    }
  });

  btnCancel.addEventListener("click", async () => {
    if (!isAdmin(currentUser, currentUserData)) {
      alert("Hanya admin yang dapat membatalkan permainan");
      return;
    }
    if (
      !confirm(
        "PERINGATAN: Batalkan sesi akan menghapus SEMUA data (peserta & chat) dan semua player akan logout. Lanjutkan?"
      )
    )
      return;

    try {
      // Set cancel flag first to trigger player logout
      await setSession({ active: false, canceledAt: Date.now() });

      // Wait a bit for players to see the notification
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Clear ALL data from database
      const clearOperations = [
        // Clear session
        safeDbOperation(
          () => db.ref(SESSION_PATH).remove(),
          "Failed to clear session"
        ),
        // Clear all players
        safeDbOperation(() => playersRef.remove(), "Failed to clear players"),
        // Clear all chat messages
        safeDbOperation(() => chatRef().remove(), "Failed to clear chat"),
      ];

      await Promise.all(clearOperations);

      // FIXED: Re-add current admin to players list with proper nickname
      await safeDbOperation(
        () =>
          playersRef.child(currentUser.uid).set({
            nickname: currentUserData.nickname, // Use nickname from database
            uid: currentUser.uid,
            online: true,
            role: "admin",
          }),
        "Failed to re-add admin"
      );

      alert("Semua data telah dihapus! Siap memulai permainan baru.");
    } catch (error) {
      alert("Gagal membatalkan sesi: " + error.message);
    }
  });

  // NEW: Function to update submit button state based on session
  function updateSubmitButtonState(session) {
    if (!btnSubmitGuess) return;

    // Check if current user has already submitted
    if (currentUser) {
      safeDbOperation(async () => {
        const playerSnap = await playersRef
          .child(currentUser.uid)
          .once("value");
        const playerData = playerSnap.val();

        if (playerData && playerData.number) {
          // Player already submitted
          btnSubmitGuess.disabled = true;
          btnSubmitGuess.textContent = "Sudah Submit";
          btnSubmitGuess.style.backgroundColor = "#6b7280";
          guessInput.disabled = true;
          return;
        }

        // Player hasn't submitted yet, check if digits have been revealed
        if (
          session &&
          session.active &&
          session.revealedDigits &&
          session.revealedDigits.length > 0
        ) {
          // First digit has been revealed, disable submit
          btnSubmitGuess.disabled = true;
          btnSubmitGuess.textContent = "Submit Ditutup";
          btnSubmitGuess.style.backgroundColor = "#ef4444";
          guessInput.disabled = true;
        } else {
          // No digits revealed yet or no active session, enable submit
          btnSubmitGuess.disabled = false;
          btnSubmitGuess.textContent = "Submit";
          btnSubmitGuess.style.backgroundColor = "#3b82f6";
          guessInput.disabled = false;
        }
      }).catch((error) => {
        console.error("Error checking player submission status:", error);
      });
    }
  }

  // MODIFIED: New function to update display based on session data
  function updateDisplayFromSession(session) {
    if (!session) return;

    const revealedDigits = session.revealedDigits || [];
    const currentIndex = session.currentDigitIndex || 0;

    // Display revealed digits
    if (revealedDigits.length > 0) {
      randomDigitsEl.textContent = revealedDigits.join("");
    } else {
      randomDigitsEl.textContent = "-";
    }

    digitsCountEl.textContent = revealedDigits.length.toString();

    // Show completion status
    if (session.gameComplete) {
      timerEl.textContent = "SELESAI";
      progressBar.style.width = "100%";
    }
  }

  // MODIFIED: New function to reveal next digit
  async function revealNextDigit(session) {
    if (!isAdmin(currentUser, currentUserData)) {
      return;
    }

    const currentIndex = session.currentDigitIndex || 0;
    const fullNumber = session.fullNumber;

    if (currentIndex >= 4 || !fullNumber) {
      return;
    }

    const digit = fullNumber[currentIndex];
    const revealedDigits = session.revealedDigits || [];
    revealedDigits.push(digit);

    const newIndex = currentIndex + 1;
    const nowTs = Date.now();

    const updates = {
      currentDigitIndex: newIndex,
      revealedDigits: revealedDigits,
      lastRevealedAt: nowTs,
    };

    // Set next reveal time or mark as complete
    if (newIndex < 4) {
      updates.nextRevealTime = nowTs + session.intervalMs;
    } else {
      updates.gameComplete = true;
      updates.completedAt = nowTs;
    }

    await safeDbOperation(async () => {
      await sessionRef.update(updates);
    }, "Failed to reveal digit");

    // Compute rewards for the newly revealed digits (realtime)
    await computeRewardsForRevealedDigits(revealedDigits);
  }

  // MODIFIED: Compute rewards based on revealed digits (realtime)
  async function computeRewardsForRevealedDigits(revealedDigits) {
    try {
      const playersSnap = await playersRef.once("value");
      const updates = {};

      playersSnap.forEach((pSnap) => {
        const p = pSnap.val();
        if (!p || !p.number) return;

        const reward = calculateReward(p.number, revealedDigits);
        updates[pSnap.key + "/reward"] = reward;
      });

      if (Object.keys(updates).length > 0) {
        await safeDbOperation(() => playersRef.update(updates));
      }
    } catch (error) {
      // Error already handled by safeDbOperation
    }
  }

  // Submit guess - MODIFIED to work with new logic
  btnSubmitGuess.addEventListener("click", async () => {
    const val = guessInput.value.trim();
    if (!/^\d{4}$/.test(val))
      return alert("Masukkan 4 digit angka (contoh: 0365)");
    const user = auth.currentUser;
    if (!user) return alert("Not logged in");

    try {
      const pRef = playersRef.child(user.uid);
      const snap = await safeDbOperation(() => pRef.once("value"));
      const data = snap.val() || {};

      if (data.number) return alert("Kamu sudah submit untuk sesi ini");

      // Check if any digits have been revealed (should not happen with proper button state management)
      const sessionSnap = await sessionRef.once("value");
      const session = sessionSnap.val();
      if (
        session &&
        session.active &&
        session.revealedDigits &&
        session.revealedDigits.length > 0
      ) {
        return alert(
          "Maaf, submit sudah ditutup karena digit pertama sudah keluar!"
        );
      }

      // FIXED: Use nickname from currentUserData (from database)
      await safeDbOperation(() =>
        pRef.update({
          number: val,
          submittedAt: Date.now(),
          nickname: currentUserData?.nickname || "Player", // Use nickname from database
        })
      );

      // Calculate reward immediately if there are revealed digits (should be 0 at this point)
      if (
        session &&
        session.revealedDigits &&
        session.revealedDigits.length > 0
      ) {
        const reward = calculateReward(val, session.revealedDigits);
        await safeDbOperation(() => pRef.update({ reward: reward }));
      }

      alert("Tebakan diterima!");
      guessInput.value = "";

      // Update submit button state immediately
      updateSubmitButtonState(session);
    } catch (error) {
      // Error already handled by safeDbOperation
    }
  });

  // Chat functionality - FIXED to use nickname from database
  btnSendChat.addEventListener("click", async () => {
    const text = chatText.value.trim();
    if (!text) return;
    const u = auth.currentUser;
    if (!u) return;

    // FIXED: Use nickname from currentUserData (from database), not email prefix
    const nick = currentUserData?.nickname || "Unknown Player";
    const payload = { uid: u.uid, nickname: nick, text, ts: Date.now() };

    try {
      await safeDbOperation(
        () => chatRef().child("messages").push(payload),
        "Failed to send message"
      );
      chatText.value = "";
    } catch (error) {
      // Error already handled by safeDbOperation
    }
  });

  // Chat input Enter key support
  chatText.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      btnSendChat.click();
    }
  });

  function addChatBubble(m) {
    const div = document.createElement("div");
    const isMe = auth.currentUser && m.uid === auth.currentUser.uid;

    // Use existing CSS classes but enhance with inline styles for better mobile experience
    div.className = "chat-bubble " + (isMe ? "me" : "other");

    // Enhanced styling for better readability and mobile experience
    div.style.cssText = `
      font-size: 0.85rem;
      line-height: 1.4;
      word-wrap: break-word;
      ${
        isMe
          ? // For current user - use light blue background with dark blue text
            "background: linear-gradient(135deg, #ddebffff, #ddebffff) !important; color: #00243fff !important;"
          : // For other users - keep existing gradient but ensure readability
            ""
      }
    `;

    div.innerHTML = `
      <div style="font-weight: 600; font-size: 0.8rem; margin-bottom: 2px; opacity: 0.9;">
        ${escapeHtml(m.nickname)}
      </div>
      <div style="margin-bottom: 4px;">
        ${escapeHtml(m.text)}
      </div>
      <div style="font-size: 0.7rem; opacity: 0.7; text-align: right;">
        ${new Date(m.ts).toLocaleTimeString("id-ID", {
          hour: "2-digit",
          minute: "2-digit",
        })}
      </div>
    `;

    chatWindow.appendChild(div);
    chatWindow.scrollTop = chatWindow.scrollHeight;
  }

  function escapeHtml(s) {
    return String(s).replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        }[c])
    );
  }

  // MODIFIED: Timer logic - handles digit reveal countdown
  let timerInterval = null;
  function startTimer(session) {
    if (!session || !session.active) {
      // Stop timer if session is not active
      if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
      }
      timerEl.textContent = "--:--";
      progressBar.style.width = "0%";
      return;
    }

    if (timerInterval) clearInterval(timerInterval);

    function tick() {
      const nowTs = Date.now();

      // Check if game is complete
      if (session.gameComplete) {
        timerEl.textContent = "SELESAI";
        progressBar.style.width = "100%";
        if (timerInterval) {
          clearInterval(timerInterval);
          timerInterval = null;
        }
        return;
      }

      const nextRevealTime =
        session.nextRevealTime || session.startedAt + session.intervalMs;
      let diff = Math.max(0, nextRevealTime - nowTs);

      const mins = Math.floor(diff / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      timerEl.textContent = `${String(mins).padStart(2, "0")}:${String(
        secs
      ).padStart(2, "0")}`;

      // Calculate progress within the current 10-minute interval
      const intervalMs = session.intervalMs || 600000;
      const elapsed = intervalMs - diff;
      const pct = Math.min(100, Math.round((elapsed / intervalMs) * 100));
      progressBar.style.width = pct + "%";

      // Only admin can reveal digits when timer reaches zero
      if (diff <= 0 && isAdmin(currentUser, currentUserData)) {
        // Reload session data to get latest state before revealing
        sessionRef.once("value").then((freshSnap) => {
          const freshSession = freshSnap.val();
          if (
            freshSession &&
            freshSession.active &&
            !freshSession.gameComplete
          ) {
            revealNextDigit(freshSession);
          }
        });
      }
    }

    tick();
    timerInterval = setInterval(tick, 1000);
  }

  // MODIFIED: Session end/cancel handling - different behavior for end vs cancel
  sessionRef.on("value", (snap) => {
    const s = snap.val();

    if (s && !s.active && s.canceledAt) {
      // CANCEL: Redirect all non-admin users to login
      if (!isAdmin(currentUser, currentUserData)) {
        setTimeout(async () => {
          alert("Sesi berakhir! Anda akan diarahkan ke halaman login.");
          try {
            await auth.signOut();
          } catch (e) {
            console.error("Signout error:", e);
          }
          window.location = "index.html";
        }, 1500);
      }
    } else if (s && !s.active && s.endedAt) {
      // END: Show notification but keep players in game
      if (!isAdmin(currentUser, currentUserData)) {
        setTimeout(() => {
          alert(
            "Sesi telah berakhir. Angka direset. Tunggu admin memulai sesi baru."
          );
        }, 1000);
      }

      // Reset submit button state for new session preparation
      setTimeout(() => {
        updateSubmitButtonState(null);
      }, 1500);
    }
  });
}
