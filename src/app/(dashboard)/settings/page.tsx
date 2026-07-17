"use client";

import { useState } from "react";

export default function Settings() {

    const [notificationIsOn, setNotificationOn] = useState<boolean>(false);

    return (
        <section className="flex h-screen flex-col bg-[#f7f5f1] text-[#1f2933]">
            <header className="relative flex h-[73px] shrink-0 items-center justify-between border-b border-[#d8d3ca] bg-[#fbfaf8] px-6">
                <h1 className="absolute left-1/2 -translate-x-1/2 text-center text-lg font-semibold tracking-[0.45em] text-black">
                    Settings.
                </h1>
            </header>


            {/* Notification */ }
            <header className="mt-5 relative flex w-3/4 self-center 
                shrink-0 border-b border-black px-6"> 
            </header> 

            <div className="mt-2 flex w-3/4 self-center justify-between py-3 px-2">

                <span className="text-sm">
                    Notification
                </span>


                <label className="inline-flex items-center cursor-pointer">

                    <input
                        type="checkbox"
                        checked={notificationIsOn}
                        onChange={(event) => setNotificationOn(event.target.checked)}
                        className="peer sr-only"
                    />

                    <div
                        className="
                            relative 
                            h-6 
                            w-11 
                            rounded-full 
                            bg-gray-300
                            transition-colors
                            peer-checked:bg-orange-500

                            peer-focus:outline-none
                            peer-focus:ring-4
                            peer-focus:ring-orange-200

                            after:absolute
                            after:left-[2px]
                            after:top-[2px]
                            after:h-5
                            after:w-5
                            after:rounded-full
                            after:bg-white
                            after:content-['']
                            after:transition-transform

                            peer-checked:after:translate-x-5
                        "
                    />

                    <span className="ml-2 text-xs font-medium text-gray-500">
                        {notificationIsOn ? "On" : "Off"}
                    </span>

                </label>

            </div>

            <div className="flex w-3/4 self-center px-2 py-1 text-xs text-gray-400">
                Get alerts on your device
            </div>


            {/* Study Reminder */}
            <header className="mt-5 relative flex w-3/4 self-center 
                shrink-0 items-center justify-between border-b border-black
                px-6"> 
            </header>

            <main className="mt-2 flex w-3/4 self-center text-sm py-3 px-2 text-semibold">
                Study Reminder
            </main>

            <main className="flex w-3/4 self-center text-xs py-1 px-2 text-bold text-gray-400">
                Get reminder for study sections
            </main>


            {/* Appearance */}
            <header className="mt-5 relative flex w-3/4 self-center 
                shrink-0 items-center justify-between border-b border-black
                px-6"> 
            </header>

            <main className="mt-2 flex w-3/4 self-center text-sm py-3 px-2 text-semibold">
                Appearance
            </main>

            <main className="flex w-3/4 self-center text-xs py-1 px-2 text-bold text-gray-400">
                Use Dark Theme
            </main>


            {/* Focus Mode */}
            <header className="mt-5 relative flex w-3/4 self-center 
                shrink-0 items-center justify-between border-b border-black
                px-6"> 
            </header>

            <main className="mt-2 flex w-3/4 self-center text-sm py-3 px-2 text-semibold">
                Focus Mode
            </main>

            <main className="flex w-3/4 self-center text-xs py-1 px-2 text-bold text-gray-400">
                Block distractions while studying
            </main>


            {/* Change Password */}
            <header className="mt-5 relative flex w-3/4 self-center 
                shrink-0 items-center justify-between border-b border-black
                px-6"> 
            </header>

            <button
                //onClick={handlePasswordChange}
                className="mt-2 flex w-3/4 self-center text-sm py-3 px-2 
                    bg-[#f7f5f1] text-black rounded hover:bg-gray-200" >
                Change Password
            </button>

            <main className="flex w-3/4 self-center text-xs py-1 px-2 text-bold text-gray-400">
                Update your accound password
            </main>


            {/* Change Email */}
            <header className="mt-5 relative flex w-3/4 self-center 
                shrink-0 items-center justify-between border-b border-black
                px-6"> 
            </header>

            <button
                //onClick={handleEmailChange}
                className="mt-2 flex w-3/4 self-center text-sm py-3 px-2 
                    bg-[#f7f5f1] text-black rounded hover:bg-gray-200" >
                Change Email
            </button>

            <main className="flex w-3/4 self-center text-xs py-1 px-2 text-bold text-gray-400">
                Update your accound email
            </main>


            {/* Language */}
            <header className="mt-5 relative flex w-3/4 self-center 
                shrink-0 items-center justify-between border-b border-black
                px-6"> 
            </header>

            <button
                //onClick={handleLanguage}
                className="mt-2 flex w-3/4 self-center text-sm py-3 px-2 
                    bg-[#f7f5f1] text-black rounded hover:bg-gray-200" >
                Language
            </button>

            <main className="flex w-3/4 self-center text-xs py-1 px-2 text-bold text-gray-400">
                English
            </main>


        </section>
  );
}