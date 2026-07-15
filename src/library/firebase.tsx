// import the functions you need from the SDKs you need

import { initializeApp } from "firebase/app";
import { getAuth, signInWithPopup, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";


// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries


// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: "studora-933f8.firebaseapp.com",
  databaseURL: "https://studora-933f8-default-rtdb.firebaseio.com",
  projectId: "studora-933f8",
  storageBucket: "studora-933f8.firebasestorage.app",
  messagingSenderId: "138752872821",
  appId: "1:138752872821:web:0b1e85d21e9d392fd8c33c",
  measurementId: "G-VYRVY2KVQN"
};


// initialize and export firebase utilities
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
const provider = new GoogleAuthProvider();

export const signInWithGoogle = async () => {
  try {
    const result = await signInWithPopup(auth, provider);
    return result.user;
  }
  catch (error: any) {
    alert("Failed to log in. Try again.");
  }
};

