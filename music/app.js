// app.js (module)
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  addDoc,
  doc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

/*
  GANTI dengan firebaseConfig milikmu:
  Dapatkan dari Firebase Console -> Project settings -> SDK setup and config
*/
const firebaseConfig = {
  apiKey: "AIzaSyDxpnj7v6svg_XtZy26jN0GZSnKmWz6e9E",
  authDomain: "quiz-f42c3.firebaseapp.com",
  databaseURL: "https://quiz-f42c3-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "quiz-f42c3",
  storageBucket: "quiz-f42c3.firebasestorage.app",
  messagingSenderId: "115695496375",
  appId: "1:115695496375:web:d0418e1b8e52a08cc67132",
  measurementId: "G-ZLKY7MJP9K"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

/* ==== UI elements ==== */
const authArea = document.getElementById('auth-area');
const lobbyArea = document.getElementById('lobby-area');
const chatArea = document.getElementById('chat-area');

const loginBtn = document.getElementById('login-btn');
const regBtn = document.getElementById('reg-btn');
const logoutBtn = document.getElementById('logout-btn');

const createRoomBtn = document.getElementById('create-room-btn');
const joinRoomBtn = document.getElementById('join-room-btn');
const joinRoomInput = document.getElementById('join-room-id');

const roomLinkDiv = document.getElementById('room-link');
const roomLinkInput = document.getElementById('room-link-input');
const copyLinkBtn = document.getElementById('copy-link-btn');

const userBar = document.getElementById('user-bar');
const userNickSpan = document.getElementById('user-nick');

const roomIdTitle = document.getElementById('room-id-title');
const messagesDiv = document.getElementById('messages');
const msgForm = document.getElementById('msg-form');
const msgInput = document.getElementById('msg-input');
const leaveRoomBtn = document.getElementById('leave-room-btn');

let currentRoomId = null;
let unsubMessages = null;
let currentUser = null;

/* ==== Auth handlers ==== */
regBtn.addEventListener('click', async () => {
  const email = document.getElementById('reg-email').value.trim();
  const pass = document.getElementById('reg-password').value;
  const nick = document.getElementById('reg-nick').value.trim() || email.split('@')[0];
  if (!email || !pass) return alert('Isi email & password');
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, pass);
    await updateProfile(cred.user, { displayName: nick });
    alert('Registrasi sukses. Sedang login...');
  } catch (e) {
    console.error(e);
    alert('Gagal registrasi: ' + e.message);
  }
});

loginBtn.addEventListener('click', async () => {
  const email = document.getElementById('login-email').value.trim();
  const pass = document.getElementById('login-password').value;
  if (!email || !pass) return alert('Isi email & password');
  try {
    await signInWithEmailAndPassword(auth, email, pass);
  } catch (e) {
    console.error(e);
    alert('Gagal login: ' + e.message);
  }
});

logoutBtn.addEventListener('click', async () => {
  if (unsubMessages) { unsubMessages(); unsubMessages = null; }
  await signOut(auth);
});

/* ==== Auth state observer ==== */
onAuthStateChanged(auth, user => {
  currentUser = user;
  if (user) {
    // show lobby
    authArea.classList.add('hidden');
    lobbyArea.classList.remove('hidden');
    chatArea.classList.add('hidden');
    userBar.classList.remove('hidden');
    userNickSpan.textContent = user.displayName || user.email;
    // if url has room id, auto-join
    const params = new URLSearchParams(location.search);
    const rid = params.get('room');
    if (rid) joinRoom(rid);
  } else {
    // show auth
    authArea.classList.remove('hidden');
    lobbyArea.classList.add('hidden');
    chatArea.classList.add('hidden');
    userBar.classList.add('hidden');
    userNickSpan.textContent = '';
    if (unsubMessages) { unsubMessages(); unsubMessages = null; }
  }
});

/* ==== Room creation / join ==== */
createRoomBtn.addEventListener('click', () => {
  const rid = generateRoomId();
  const link = `${location.origin}${location.pathname}?room=${rid}`;
  roomLinkDiv.classList.remove('hidden');
  roomLinkInput.value = link;
  // automatically join yourself
  joinRoom(rid);
});

copyLinkBtn.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(roomLinkInput.value);
    alert('Link disalin');
  } catch (e) {
    alert('Gagal menyalin: ' + e.message);
  }
});

joinRoomBtn.addEventListener('click', () => {
  const rid = joinRoomInput.value.trim();
  if (!rid) return alert('Masukkan Room ID');
  joinRoom(rid);
});

leaveRoomBtn.addEventListener('click', () => {
  if (unsubMessages) { unsubMessages(); unsubMessages = null; }
  currentRoomId = null;
  location.search = ''; // remove param
  lobbyArea.classList.remove('hidden');
  chatArea.classList.add('hidden');
});

/* ==== Messaging ==== */
msgForm.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const text = msgInput.value.trim();
  if (!text || !currentRoomId) return;
  try {
    await addDoc(collection(db, 'rooms', currentRoomId, 'messages'), {
      text,
      uid: currentUser.uid,
      nickname: currentUser.displayName || currentUser.email,
      createdAt: serverTimestamp()
    });
    msgInput.value = '';
  } catch (e) {
    console.error(e);
    alert('Gagal kirim pesan: ' + e.message);
  }
});

/* ==== Helpers ==== */
function generateRoomId() {
  // 8-char random id (you can change)
  return Math.random().toString(36).slice(2, 10);
}

function joinRoom(rid) {
  if (!currentUser) {
    alert('Silakan login dulu.');
    return;
  }
  currentRoomId = rid;
  roomIdTitle.textContent = rid;
  lobbyArea.classList.add('hidden');
  authArea.classList.add('hidden');
  chatArea.classList.remove('hidden');

  // update URL param
  const url = new URL(location);
  url.searchParams.set('room', rid);
  history.replaceState({}, '', url);

  // subscribe to messages (ordered)
  const msgsRef = collection(db, 'rooms', rid, 'messages');
  const q = query(msgsRef, orderBy('createdAt', 'asc'));
  if (unsubMessages) unsubMessages();
  messagesDiv.innerHTML = '<p class="muted">Memuat pesan...</p>';
  unsubMessages = onSnapshot(q, snap => {
    messagesDiv.innerHTML = '';
    snap.forEach(doc => {
      const d = doc.data();
      // createdAt may be null for serverTimestamp not resolved yet
      const time = d.createdAt ? d.createdAt.toDate() : new Date();
      addMessageToUI({
        id: doc.id,
        uid: d.uid,
        nickname: d.nickname,
        text: d.text,
        time
      });
    });
    // scroll to bottom
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  }, err => {
    console.error('onSnapshot error', err);
    messagesDiv.innerHTML = '<p class="muted">Gagal memuat pesan.</p>';
  });
}

function addMessageToUI({ id, uid, nickname, text, time }) {
  const el = document.createElement('div');
  el.className = 'msg ' + (uid === currentUser.uid ? 'me' : 'their');
  const meta = document.createElement('div');
  meta.className = 'meta';
  meta.textContent = `${nickname} • ${formatTime(time)}`;
  const body = document.createElement('div');
  body.className = 'body';
  body.textContent = text;
  el.appendChild(meta);
  el.appendChild(body);
  messagesDiv.appendChild(el);
}

function formatTime(d) {
  const t = new Date(d);
  return t.toLocaleString();
}
