// Ganti konfigurasi ini dengan konfigurasi Firebase milikmu
const firebaseConfig = {
  apiKey: "AIzaSyBALc8nUyDT8pd1UWB7OqEMRYvRA4vT0PI",
  authDomain: "lottery-69b04.firebaseapp.com",
  databaseURL:
    "https://lottery-69b04-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "lottery-69b04",
  storageBucket: "lottery-69b04.firebasestorage.app",
  messagingSenderId: "1041016544940",
  appId: "1:1041016544940:web:65a980e3ffdc5a25160909",
  measurementId: "G-Z04Y5CJ3PB",
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
