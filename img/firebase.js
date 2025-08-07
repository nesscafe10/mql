// Ganti konfigurasi ini dengan konfigurasi Firebase milikmu
<script type="module">
  // Import the functions you need from the SDKs you need
  import { initializeApp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";
  import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-analytics.js";
  // TODO: Add SDKs for Firebase products that you want to use
  // https://firebase.google.com/docs/web/setup#available-libraries

  // Your web app's Firebase configuration
  // For Firebase JS SDK v7.20.0 and later, measurementId is optional
  const firebaseConfig = {
    apiKey: "AIzaSyBALc8nUyDT8pd1UWB7OqEMRYvRA4vT0PI",
    authDomain: "lottery-69b04.firebaseapp.com",
    databaseURL: "https://lottery-69b04-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "lottery-69b04",
    storageBucket: "lottery-69b04.firebasestorage.app",
    messagingSenderId: "1041016544940",
    appId: "1:1041016544940:web:65a980e3ffdc5a25160909",
    measurementId: "G-Z04Y5CJ3PB"
  };

  // Initialize Firebase
  const app = initializeApp(firebaseConfig);
  const analytics = getAnalytics(app);
</script>
