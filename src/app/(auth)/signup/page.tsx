"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { auth, db } from "@/src/library/firebase";
import { createUserWithEmailAndPassword } from "firebase/auth";

import {
  doc,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";

export default function Signup() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("");

  const greeting: string = "s t u d o r a .";


  async function handleSignup() {
    try {
      // create authentication account
      const userCredntial = 
        await createUserWithEmailAndPassword(auth, email, password);

      // get firebase user's UID
      const user = userCredntial.user;

      // create the user's firestore document
      await setDoc(doc(db, "users", user.uid), {
        name: name,
        email: email,
        role: role,
        joinedAt: serverTimestamp(),
      });

      router.push("/");

    } catch (error) {

      alert("Account Failed to be Created.");
      console.log(error);
    }
  }
  
  return (
    <div className="flex min-h-screen items-center justify-center 
                    bg-orange-50">
      <div className="bg-white rounded items-center shadow-md flex 
                      flex-col w-100 h-100 p-6">

        <img
          src="/app-logo.png"
          alt="studora logo"
          className="w-42 h-42"
        />

        <h1 className="text-3xl font-bold text-black font-sans">
          {greeting}
        </h1>

        <p className="text-black font-mono font-thin text-xs">
          More than just notes !
        </p>

        <div className="flex flex-col gap-4 w-full mt-8">
          
          <input
            type="name"
            placeholder="name"
            className="border px-3 py-2 rounded mt-8 font-mono text-sm"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          
          <input
            type="email"
            placeholder="email"
            className="border px-3 py-2 rounded mt-2 font-mono text-sm"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <input
            type="password"
            placeholder="password"
            className="border px-3 py-2 rounded mt-2 font-mono text-sm"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          <input
            type="role"
            placeholder="role"
            className="border px-3 py-2 rounded mt-2 font-mono text-sm"
            value={role}
            onChange={(e) => setRole(e.target.value)}
          />

          <button
            onClick={handleSignup}
            className="bg-black text-white py-1 px-4 rounded 
                      hover:bg-gray-800" >
            Sign In
          </button>
        </div>
      </div>
    </div>
  
  );
}