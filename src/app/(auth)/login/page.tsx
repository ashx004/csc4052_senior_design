// tells the code that this page is interactive
"use client";


import { useState } from "react";
import { auth } from "../../library/firebase";
import { signInWithEmailAndPassword } from "firebase/auth";
//import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const greeting: string = "s t u d o r a .";
  //const router = useRouter();

  async function handleLogin() {
    try {
      await signInWithEmailAndPassword(auth, email, password);
      //router.push("/dashboard");
      alert("Login Successful !");
    } catch (error) {
      alert("Login failed.");
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
            type="email"
            placeholder="email"
            className="border px-3 py-2 rounded mt-8"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <input
            type="password"
            placeholder="password"
            className="border px-3 py-2 rounded"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          <button
            onClick={handleLogin}
            className="bg-black text-white py-1 px-4 rounded 
                      hover:bg-gray-800" >
            Log In
          </button>
        </div>
      </div>
    </div>
  
  );
}