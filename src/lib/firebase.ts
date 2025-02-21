import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyBu3Lvkp4s_RX6qNHpRPKimc3jwY5cPhgs",
  authDomain: "structify-chris-cole.firebaseapp.com",
  projectId: "structify-chris-cole",
  storageBucket: "structify-chris-cole.firebasestorage.app",
  messagingSenderId: "55459428968",
  appId: "1:55459428968:web:56233aaec4e7699361d9dd"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Get Firebase services
export const db = getFirestore(app);
export const storage = getStorage(app);
export const auth = getAuth(app);

export default app;