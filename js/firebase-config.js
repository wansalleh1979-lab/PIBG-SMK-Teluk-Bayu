/* ============================================================
   FILL THIS IN with your own Firebase project's config.
   Find it at: Firebase Console > Project settings (gear icon)
   > General tab > "Your apps" > SDK setup and configuration
   ============================================================ */
// Import the functions you need from the SDKs you need

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyDb1c68rpT3SHvpVyH0jmhQAol2gemM7q4",
  authDomain: "pibg-fund-management.firebaseapp.com",
  projectId: "pibg-fund-management",
  storageBucket: "pibg-fund-management.firebasestorage.app",
  messagingSenderId: "851070033222",
  appId: "1:851070033222:web:ea61a575f1716c3d051947",
  measurementId: "G-KHLXR6XWFV"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();