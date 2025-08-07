let currentUser = null;
let isAdmin = false;
let sessionStarted = false;
let timerInterval = null;
let countdown = 0;
let currentRound = 0;
const maxRounds = 4;
let currentNumber = "";

const adminEmail = "selimau.wen9.net@gmail.com";

// --- AUTH ---
auth.onAuthStateChanged(async (user) => {
  if (user) {
    currentUser = user;
    isAdmin = user.email === adminEmail;

    document.getElementById("userInfo").innerText =
      "Login sebagai: " + user.email;
    if (isAdmin) {
      document.getElementById("adminControls").style.display = "block";
    } else {
      document.getElementById("guessInput").disabled = false;
    }

    setupSessionListener();
    setupPlayersListener();
    setupChatListener();

    if (!isAdmin) {
      const userDoc = await db.collection("users").doc(user.uid).get();
      if (!userDoc.exists) {
        alert("Data pengguna tidak ditemukan!");
        return;
      }
    }
  } else {
    window.location.href = "index.html";
  }
});

// --- ADMIN CONTROLS ---
document.getElementById("startBtn").onclick = async () => {
  if (!isAdmin) return;

  const sessionDoc = db.collection("session").doc("current");
  await sessionDoc.set({
    startedAt: firebase.firestore.Timestamp.now(),
    round: 0,
    numbers: [],
    ended: false,
  });
};

document.getElementById("newSessionBtn").onclick = async () => {
  if (!isAdmin) return;

  await db.collection("session").doc("current").set({
    startedAt: firebase.firestore.Timestamp.now(),
    round: 0,
    numbers: [],
    ended: false,
  });

  const users = await db.collection("users").get();
  const batch = db.batch();
  users.forEach((doc) => {
    batch.update(doc.ref, { angka: "", hadiah: 0 });
  });
  await batch.commit();
};

// --- SESSION LISTENER ---
function setupSessionListener() {
  db.collection("session")
    .doc("current")
    .onSnapshot((doc) => {
      const data = doc.data();
      if (!data) return;

      sessionStarted = true;
      currentRound = data.round;
      countdown = getRemainingSeconds(data.startedAt.toDate(), currentRound);

      if (data.ended) {
        clearInterval(timerInterval);
        document.getElementById("timer").innerText = "Sesi berakhir.";
        document.getElementById("startBtn").style.display = "none";
        document.getElementById("newSessionBtn").style.display = "block";
        return;
      }

      updateTimerUI();

      if (!timerInterval) {
        timerInterval = setInterval(() => {
          countdown--;
          updateTimerUI();

          if (countdown <= 0 && currentRound < maxRounds) {
            generateRandomNumber();
          }

          if (countdown <= 0 && currentRound >= maxRounds) {
            endSession();
          }
        }, 1000);
      }

      if (data.numbers && data.numbers.length > 0) {
        currentNumber = data.numbers[data.numbers.length - 1];
        displayCurrentNumber(currentNumber);
      }
    });
}

function getRemainingSeconds(startTime, round) {
  const start = new Date(startTime).getTime();
  const now = new Date().getTime();
  const elapsed = Math.floor((now - start) / 1000);
  const offset = round * 600;
  return 600 - (elapsed - offset);
}

function updateTimerUI() {
  let min = Math.floor(countdown / 60);
  let sec = countdown % 60;
  document.getElementById("timer").innerText =
    "Sisa waktu: " + min + "m " + sec + "s";
}

async function generateRandomNumber() {
  const num = Math.floor(1000 + Math.random() * 9000).toString();
  currentNumber = num;

  const sessionRef = db.collection("session").doc("current");
  const sessionSnap = await sessionRef.get();
  const sessionData = sessionSnap.data();
  const newRound = sessionData.round + 1;

  await sessionRef.update({
    numbers: firebase.firestore.FieldValue.arrayUnion(num),
    round: newRound,
  });

  calculateWinners(num);
}

function endSession() {
  db.collection("session").doc("current").update({ ended: true });
}

function displayCurrentNumber(num) {
  const el = document.getElementById("currentNumber");
  el.innerHTML = "Angka Sistem: " + highlightMatchingDigits(num);
}

async function submitGuess() {
  const angka = document.getElementById("guessInput").value;
  if (!/^[0-9]{4}$/.test(angka)) return alert("Masukkan angka 4 digit!");

  const userRef = db.collection("users").doc(currentUser.uid);
  await userRef.update({ angka });
  document.getElementById("guessInput").disabled = true;
}

async function calculateWinners(systemNumber) {
  const users = await db.collection("users").get();

  users.forEach(async (doc) => {
    const data = doc.data();
    const guess = data.angka;
    if (!guess || guess.length !== 4) return;

    let match = 0;
    for (let i = 0; i < 4; i++) {
      if (systemNumber.includes(guess[i])) match++;
    }

    const reward = match * 5000;
    if (reward > 0) {
      await db
        .collection("users")
        .doc(doc.id)
        .update({
          hadiah: firebase.firestore.FieldValue.increment(reward),
        });
    }
  });
}

function highlightMatchingDigits(systemNumber) {
  const guess = currentUser ? document.getElementById("guessInput").value : "";
  if (!guess || guess.length !== 4) return systemNumber;

  let result = "";
  for (let i = 0; i < 4; i++) {
    if (guess.includes(systemNumber[i])) {
      result += `<span class="highlight">${systemNumber[i]}</span>`;
    } else {
      result += systemNumber[i];
    }
  }
  return result;
}

function setupPlayersListener() {
  db.collection("users").onSnapshot((snapshot) => {
    const tbody = document.querySelector("#playerTable tbody");
    tbody.innerHTML = "";
    let i = 1;
    snapshot.forEach((doc) => {
      const data = doc.data();
      if (data.email === adminEmail) return;

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${i++}</td>
        <td>${data.nickname}</td>
        <td>${data.angka || "-"}</td>
        <td>Rp ${data.hadiah.toLocaleString()}</td>
      `;
      tbody.appendChild(tr);
    });
  });
}

function setupChatListener() {
  db.collection("chat")
    .orderBy("timestamp", "asc")
    .onSnapshot((snapshot) => {
      const box = document.getElementById("chatBox");
      box.innerHTML = "";
      snapshot.forEach((doc) => {
        const data = doc.data();
        const msg = document.createElement("div");
        msg.innerText = data.nickname + ": " + data.message;
        box.appendChild(msg);
      });
      box.scrollTop = box.scrollHeight;
    });
}

async function sendChat() {
  const input = document.getElementById("chatInput");
  const text = input.value.trim();
  if (!text) return;

  const userDoc = await db.collection("users").doc(currentUser.uid).get();
  const nickname = userDoc.exists ? userDoc.data().nickname : "Admin";

  await db.collection("chat").add({
    nickname,
    message: text,
    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
  });

  input.value = "";
}
