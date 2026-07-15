'use client';

import Link from "next/link";
import GoogleButton from '@/src/components/homepage/GoogleButton'

export default function Home() {
  const greeting: string = "s t u d o r a .";

  return (
    <div className="flex min-h-screen justify-center bg-orange-50">
      <div className="text-center">

        <img
          src="/app-logo.png"
          alt="studora logo"
          className="w-85 h-85"
        />

        <h1 className="text-4xl font-bold text-black font-sans">
          {greeting}
        </h1>

        <p className="text-black font-mono font-thin text-sm mt-6">
          More than just notes !
        </p>

        <div className="mt-20 flex flex-col items-center">
          <Link href="/login">
            <button className="bg-transparent font-thin text-sm underline
            text-black font-sans cursor-pointer px-16 py-2 rounded 
            hover:bg-gray-100 active:bg-gray-200">
              Log-In
            </button>
          </Link>

          <Link href="/signup">
            <button className="mt-2 bg-transparent font-thin text-sm underline
            text-black font-sans cursor-pointer px-4 py-2 rounded 
            hover:bg-gray-100 active:bg-gray-200">
              Create a new account
            </button>
          </Link>

          <GoogleButton />

          <button className="mt-5 bg-white font-thin text-sm
          text-black font-sans cursor-pointer px-12 py-3 rounded 
          hover:bg-gray-100 active:bg-gray-200 flex items-center 
          gap-2">
            <span> Sign in with Apple </span>
            <img 
              src="/apple-logo.png" 
              alt="Apple Icon" 
              className="w-5 h-5"
            />
          </button>
        </div>
      </div>
    </div>
  );
}