import React from 'react';
import { signInWithGoogle } from '@/src/library/firebase';

export default function GoogleButton() {
    const handleLogin = async () => {
        try {
            const user = await signInWithGoogle();
            if (user) {
                console.log("Logged in user:", user.displayName);
            }
        }
        catch (error) {
            alert("Failed to log in. Please try again.");
        }
    };

    return (
        <button onClick={handleLogin} className="mt-24 bg-white font-thin text-sm
            text-black font-sans cursor-pointer px-10 py-2 rounded 
            hover:bg-gray-100 active:bg-gray-200 flex items-center 
            gap-2">
                <span> Sign in with Google </span>
                <img 
                src="/google-logo.png" 
                alt="Google Icon" 
                className="w-6 h-6"
                />
        </button>
    );
}