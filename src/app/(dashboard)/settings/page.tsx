"use client";

import { useEffect, useState } from "react";
import {
    EmailAuthProvider,
    FirebaseError,
    reauthenticateWithCredential,
    updatePassword,
    verifyBeforeUpdateEmail,
} from "firebase/auth";
import { signOut } from "firebase/auth";
import { useRouter } from "next/navigation";
import { auth } from "../../../library/firebase";


export default function Settings() {

    const [notificationIsOn, setNotificationOn] = useState<boolean>(false);
    const [studyRemIsOn, setstudyRemOn] = useState<boolean>(false);
    const [appearanceIsOn, setAppearanceOn] = useState<boolean>(false);
    const [focusIsOn, setFocusOn] = useState<boolean>(false);

    const [showPasswordForm, setShowPasswordForm] = useState<boolean>(false);
    const [showEmailForm, setShowEmailForm] = useState<boolean>(false);

    const [currentPassword, setCurrentPassword] = useState<string>("");
    const [newPassword, setNewPassword] = useState<string>("");
    const [confirmPassword, setConfirmPassword] = useState<string>("");

    const [newEmail, setNewEmail] = useState<string>("");

    const [accountMessage, setAccountMessage] = useState<string>("");
    const [accountError, setAccountError] = useState<string>("");
    const [isUpdatingAccount, setIsUpdatingAccount] = useState<boolean>(false);

    const router = useRouter();


    useEffect(() => {
        const selectedTheme = localStorage.getItem("theme");
        const isDark = selectedTheme == "dark";

        document.documentElement.classList.toggle("dark", isDark);
        setAppearanceOn(isDark);
    }, []);

    function handleAppearanceChange(isOn: boolean) {
        setAppearanceOn(isOn);

        document.documentElement.classList.toggle("dark", isOn);
        localStorage.setItem("theme", isOn ? "dark" : "light");
    }


    async function reauthenticateUser(password: string): Promise<void> {
        const user = auth.currentUser;

        if (!user) {
            throw new Error("You must be signed in to update your account."); }
        if (!user.email) {
            throw new Error("Your account does not have an email address."); }

        const credential = EmailAuthProvider.credential(
            user.email,
            password  );

        await reauthenticateWithCredential(user, credential);
    }

    async function handlePasswordChange(
        event: React.FormEvent<HTMLFormElement>): Promise<void> {
        event.preventDefault();

        setAccountError("");
        setAccountMessage("");

        if (!currentPassword || !newPassword || !confirmPassword) {
            setAccountError("Please complete every password field.");
            return; }

        if (newPassword.length < 6) {
            setAccountError(
                "Your new password must contain at least 6 characters." );
            return;
        }

        if (newPassword !== confirmPassword) {
            setAccountError("The new passwords do not match.");
            return;
        }

        if (currentPassword === newPassword) {
            setAccountError(
                "Your new password must be different from your current password." );
            return;
        }

        try {
            setIsUpdatingAccount(true);

            await reauthenticateUser(currentPassword);

            const user = auth.currentUser;

            if (!user) {
                throw new Error("You must be signed in."); }

            await updatePassword(user, newPassword);

            setAccountMessage("Your password was changed successfully.");
            setCurrentPassword("");
            setNewPassword("");
            setConfirmPassword("");
            setShowPasswordForm(false);
        } catch (error: unknown) {
            handleAccountError(error);
        } finally {
            setIsUpdatingAccount(false);
        }
    }

    async function handleEmailChange(
        event: React.FormEvent<HTMLFormElement>): Promise<void> {
        event.preventDefault();

        setAccountError("");
        setAccountMessage("");

        const cleanedEmail = newEmail.trim().toLowerCase();

        if (!currentPassword || !cleanedEmail) {
            setAccountError(
                "Please enter your current password and new email.");
            return;
        }

        if (!cleanedEmail.includes("@")) {
            setAccountError("Please enter a valid email address.");
            return;
        }

        if (auth.currentUser?.email?.toLowerCase() === cleanedEmail) {
            setAccountError(
                "The new email must be different from your current email.");
            return;
        }

        try {
            setIsUpdatingAccount(true);

            await reauthenticateUser(currentPassword);

            const user = auth.currentUser;

            if (!user) {
                throw new Error("You must be signed in."); }

            await verifyBeforeUpdateEmail(user, cleanedEmail);

            setAccountMessage(
                `A verification link was sent to ${cleanedEmail}. Open the link to finish changing your email.` );

            setCurrentPassword("");
            setNewEmail("");
            setShowEmailForm(false);
        } catch (error: unknown) {
            handleAccountError(error);
        } finally {
            setIsUpdatingAccount(false);
        }
    }


    function handleAccountError(error: unknown): void {
        console.error(error);

        if (!(error instanceof FirebaseError)) {
            setAccountError(
                error instanceof Error
                    ? error.message
                    : "Something went wrong. Please try again.");
            return;
        }

        switch (error.code) {
            case "auth/wrong-password":
            case "auth/invalid-credential":
                setAccountError("Your current password is incorrect.");
                break;

            case "auth/email-already-in-use":
                setAccountError(
                    "That email address is already connected to another account." );
                break;

            case "auth/invalid-email":
                setAccountError("Please enter a valid email address.");
                break;

            case "auth/weak-password":
                setAccountError(
                    "Your new password is not strong enough." );
                break;

            case "auth/too-many-requests":
                setAccountError(
                    "Too many attempts were made. Please try again later." );
                break;

            case "auth/requires-recent-login":
                setAccountError(
                    "For security, please log out, log back in, and try again." );
                break;

            default:
                setAccountError(
                    error.message || "Unable to update your account.");
        }
    }


    const handleSignOut = async () => {
        try {
            await signOut(auth);

            // Sends the signed-out user back to the login page
            router.push("/login");
        } catch (error) {
            console.error("Sign-out failed:", error);
        }
    };



    return (
        <section className="flex min-h-screen flex-col bg-[#f7f5f1] text-[#1f2933]
                            transition-colors duration-700 dark:bg-[#171717] dark:text-gray-100">
            <header className="relative flex h-[73px] shrink-0 items-center justify-between border-b border-[#d8d3ca] bg-[#fbfaf8] px-6
                            transition-colors duration-300 dark:border-gray-700 dark:bg-[#202020]">
                <h1 className="absolute left-1/2 -translate-x-1/2 text-center text-lg font-semibold tracking-[0.45em] text-black
                            dark:text-white">
                    Settings.
                </h1>
            </header>



            {/* Notification
            <header className="mt-5 relative flex w-3/4 self-center 
                shrink-0 border-b border-black dark:border-gray-600 px-6"> 
            </header> 

            <div className="mt-2 flex w-3/4 self-center justify-between py-3 px-2
                        bg-[#f7f5f1] text-black hover:bg-gray-200
                        dark:bg-[#171717] dark:text-gray-100 dark:hover:bg-gray-700">

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
            */ }



            {/* Study Reminder
            <header className="mt-5 relative flex w-3/4 self-center 
                shrink-0 border-b border-black dark:border-gray-600 px-6"> 
            </header> 

            <div className="mt-2 flex w-3/4 self-center justify-between py-3 px-2
                            bg-[#f7f5f1] text-black hover:bg-gray-200
                            dark:bg-[#171717] dark:text-gray-100 dark:hover:bg-gray-700">

                <span className="text-sm">
                    Study Reminder
                </span>


                <label className="inline-flex items-center cursor-pointer">

                    <input
                        type="checkbox"
                        checked={studyRemIsOn}
                        onChange={(event) => setstudyRemOn(event.target.checked)}
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
                        {studyRemIsOn ? "On" : "Off"}
                    </span>

                </label>

            </div>

            <div className="flex w-3/4 self-center px-2 py-1 text-xs text-gray-400">
                Get reminder for study sections
            </div>
            */ }



            {/* Appearance */ }
            <header className="mt-5 relative flex w-3/4 self-center 
                shrink-0 border-b border-black dark:border-gray-600 px-6"> 
            </header> 

            <div className="mt-2 flex w-3/4 self-center justify-between py-3 px-2
                        bg-[#f7f5f1] text-black hover:bg-gray-200
                        dark:bg-[#171717] dark:text-gray-100 dark:hover:bg-gray-700">

                <span className="text-sm">
                    Appearance
                </span>


                <label className="inline-flex items-center cursor-pointer">

                    <input
                        type="checkbox"
                        checked={appearanceIsOn}
                        onChange={(event) => handleAppearanceChange(event.target.checked)}
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
                        {appearanceIsOn ? "Dark" : "Light"}
                    </span>

                </label>

            </div>

            <div className="flex w-3/4 self-center px-2 py-1 text-xs text-gray-400">
                Use Dark Theme
            </div>



            {/* Focus Mode
            <header className="mt-5 relative flex w-3/4 self-center 
                shrink-0 border-b border-black dark:border-gray-600 px-6"> 
            </header> 

            <div className="mt-2 flex w-3/4 self-center justify-between py-3 px-2
                        bg-[#f7f5f1] text-black hover:bg-gray-200
                        dark:bg-[#171717] dark:text-gray-100 dark:hover:bg-gray-700">

                <span className="text-sm">
                    Focus Mode
                </span>


                <label className="inline-flex items-center cursor-pointer">

                    <input
                        type="checkbox"
                        checked={focusIsOn}
                        onChange={(event) => setFocusOn(event.target.checked)}
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
                        {focusIsOn ? "On" : "Off"}
                    </span>

                </label>

            </div>

            <div className="flex w-3/4 self-center px-2 py-1 text-xs text-gray-400">
                Block distractions while studying
            </div>
            */ }




            {/* Change Password */}
            <header
                className="relative mt-5 flex w-3/4 shrink-0 self-center
                        items-center justify-between border-b border-black px-6
                        dark:border-gray-600"
            />

            <button
                type="button"
                onClick={() => {
                    setShowPasswordForm((currentValue) => !currentValue);
                    setShowEmailForm(false);
                    setAccountError("");
                    setAccountMessage("");
                    setCurrentPassword("");
                }}
                className="mt-2 flex w-3/4 self-center rounded
                        bg-[#f7f5f1] px-2 py-3 text-sm text-black
                        hover:bg-gray-200
                        dark:bg-[#171717] dark:text-gray-100
                        dark:hover:bg-gray-700"
            >
                Change Password
            </button>

            <p className="flex w-3/4 self-center px-2 py-1 text-xs text-gray-400">
                Update your account password
            </p>

            {showPasswordForm && (
                <form
                    onSubmit={handlePasswordChange}
                    className="mt-3 flex w-3/4 flex-col gap-3 self-center
                            rounded border border-[#d8d3ca] bg-[#fbfaf8] p-4
                            dark:border-gray-700 dark:bg-[#202020]"
                >
                    <label className="flex flex-col gap-1 text-sm">
                        Current Password

                        <input
                            type="password"
                            value={currentPassword}
                            onChange={(event) =>
                                setCurrentPassword(event.target.value)
                            }
                            autoComplete="current-password"
                            className="rounded border border-gray-300 bg-white
                                    px-3 py-2 text-black outline-none
                                    focus:border-orange-500
                                    dark:border-gray-600 dark:bg-[#171717]
                                    dark:text-white"
                        />
                    </label>

                    <label className="flex flex-col gap-1 text-sm">
                        New Password

                        <input
                            type="password"
                            value={newPassword}
                            onChange={(event) =>
                                setNewPassword(event.target.value)
                            }
                            autoComplete="new-password"
                            className="rounded border border-gray-300 bg-white
                                    px-3 py-2 text-black outline-none
                                    focus:border-orange-500
                                    dark:border-gray-600 dark:bg-[#171717]
                                    dark:text-white"
                        />
                    </label>

                    <label className="flex flex-col gap-1 text-sm">
                        Confirm New Password

                        <input
                            type="password"
                            value={confirmPassword}
                            onChange={(event) =>
                                setConfirmPassword(event.target.value)
                            }
                            autoComplete="new-password"
                            className="rounded border border-gray-300 bg-white
                                    px-3 py-2 text-black outline-none
                                    focus:border-orange-500
                                    dark:border-gray-600 dark:bg-[#171717]
                                    dark:text-white"
                        />
                    </label>

                    <div className="flex justify-end gap-2">
                        <button
                            type="button"
                            onClick={() => {
                                setShowPasswordForm(false);
                                setCurrentPassword("");
                                setNewPassword("");
                                setConfirmPassword("");
                                setAccountError("");
                            }}
                            className="rounded px-4 py-2 text-sm hover:bg-gray-200
                                    dark:hover:bg-gray-700"
                        >
                            Cancel
                        </button>

                        <button
                            type="submit"
                            disabled={isUpdatingAccount}
                            className="rounded bg-orange-500 px-4 py-2 text-sm
                                    text-white hover:bg-orange-600
                                    disabled:cursor-not-allowed
                                    disabled:opacity-50"
                        >
                            {isUpdatingAccount
                                ? "Updating..."
                                : "Save Password"}
                        </button>
                    </div>
                </form>
            )}






            {/* Change Email */}
            <header
                className="relative mt-5 flex w-3/4 shrink-0 self-center
                        items-center justify-between border-b border-black px-6
                        dark:border-gray-600"
            />

            <button
                type="button"
                onClick={() => {
                    setShowEmailForm((currentValue) => !currentValue);
                    setShowPasswordForm(false);
                    setAccountError("");
                    setAccountMessage("");
                    setCurrentPassword("");
                }}
                className="mt-2 flex w-3/4 self-center rounded
                        bg-[#f7f5f1] px-2 py-3 text-sm text-black
                        hover:bg-gray-200
                        dark:bg-[#171717] dark:text-gray-100
                        dark:hover:bg-gray-700"
            >
                Change Email
            </button>

            <p className="flex w-3/4 self-center px-2 py-1 text-xs text-gray-400">
                Current email: {auth.currentUser?.email ?? "Not available"}
            </p>

            {showEmailForm && (
                <form
                    onSubmit={handleEmailChange}
                    className="mt-3 flex w-3/4 flex-col gap-3 self-center
                            rounded border border-[#d8d3ca] bg-[#fbfaf8] p-4
                            dark:border-gray-700 dark:bg-[#202020]"
                >
                    <label className="flex flex-col gap-1 text-sm">
                        Current Password

                        <input
                            type="password"
                            value={currentPassword}
                            onChange={(event) =>
                                setCurrentPassword(event.target.value)
                            }
                            autoComplete="current-password"
                            className="rounded border border-gray-300 bg-white
                                    px-3 py-2 text-black outline-none
                                    focus:border-orange-500
                                    dark:border-gray-600 dark:bg-[#171717]
                                    dark:text-white"
                        />
                    </label>

                    <label className="flex flex-col gap-1 text-sm">
                        New Email

                        <input
                            type="email"
                            value={newEmail}
                            onChange={(event) =>
                                setNewEmail(event.target.value)
                            }
                            autoComplete="email"
                            placeholder="newemail@example.com"
                            className="rounded border border-gray-300 bg-white
                                    px-3 py-2 text-black outline-none
                                    focus:border-orange-500
                                    dark:border-gray-600 dark:bg-[#171717]
                                    dark:text-white"
                        />
                    </label>

                    <div className="flex justify-end gap-2">
                        <button
                            type="button"
                            onClick={() => {
                                setShowEmailForm(false);
                                setCurrentPassword("");
                                setNewEmail("");
                                setAccountError("");
                            }}
                            className="rounded px-4 py-2 text-sm hover:bg-gray-200
                                    dark:hover:bg-gray-700"
                        >
                            Cancel
                        </button>

                        <button
                            type="submit"
                            disabled={isUpdatingAccount}
                            className="rounded bg-orange-500 px-4 py-2 text-sm
                                    text-white hover:bg-orange-600
                                    disabled:cursor-not-allowed
                                    disabled:opacity-50"
                        >
                            {isUpdatingAccount
                                ? "Sending..."
                                : "Verify New Email"}
                        </button>
                    </div>
                </form>
            )}




            {accountError && (
            <p
                role="alert"
                className="mt-3 w-3/4 self-center rounded
                        bg-red-100 px-3 py-2 text-sm text-red-700
                        dark:bg-red-950 dark:text-red-300" >
                {accountError}
            </p>
            )}

        {accountMessage && (
            <p
                role="status"
                className="mt-3 w-3/4 self-center rounded
                        bg-green-100 px-3 py-2 text-sm text-green-700
                        dark:bg-green-950 dark:text-green-300" >
                {accountMessage}
            </p>
            )}







            {/* Sign Out */}
            <header className="mt-5 relative flex w-3/4 self-center 
                shrink-0 items-center justify-between border-b border-black
                px-6"> 
            </header>

            <button
                onClick={handleSignOut}
                className="mt-2 flex w-3/4 self-center text-sm py-3 px-2 
                    bg-[#f7f5f1] text-red-500 rounded hover:bg-gray-200
                    dark:bg-[#171717] dark:text-red-500 dark:hover:bg-gray-700" >
                Sign Out
            </button>


        </section>
  );
}