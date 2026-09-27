import "server-only";
import { adminAuth } from "../firebaseAdmin";

function actionSettings(path: string) {
    const appUrl = process.env.APP_BASE_URL;
    if (!appUrl) {
        throw new Error("APP_BASE_URL is not configured");
    }
    
    return {
        url: new URL(path, appUrl).toString(),
        handleCodeInApp: false,
    };
}

export function generateVerificationLink(email: string) {
    return adminAuth.generateEmailVerificationLink(
        email,
        actionSettings("/login?emailVerified=1")
    );
}

export function generatePasswordResetLink(email: string) {
    return adminAuth.generatePasswordResetLink(
        email,
        actionSettings("/login?passwordReset=1")
    );
}

export function generateEmailChangeLink(
    currentEmail: string,
    newEmail: string
) {
    return adminAuth.generateVerifyAndChangeEmailLink(
        currentEmail,
        newEmail,
        actionSettings("/settings?emailChanged=1")
    );
}