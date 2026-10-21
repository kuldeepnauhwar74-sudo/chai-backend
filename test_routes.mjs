import "dotenv/config";
import dns from "node:dns";
dns.setServers(["8.8.8.8", "8.8.4.4"]);

import connectDB from "./src/db/index.js";
import { app } from "./src/app.js";
import { User } from "./src/models/user.model.js";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const PORT = 8002;

async function runFullTestSuite() {
    await connectDB();
    const server = http.createServer(app);
    await new Promise(resolve => server.listen(PORT, resolve));
    console.log(`\n========================================`);
    console.log(`TEST SERVER RUNNING ON PORT ${PORT}`);
    console.log(`========================================\n`);

    const baseUrl = `http://localhost:${PORT}/api/v1/users`;

    // 1x1 dummy PNG buffer
    const pngBuffer = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
        "base64"
    );

    const testUser = {
        fullName: "Test User Full",
        username: "testuser_" + Date.now(),
        email: `testuser_${Date.now()}@example.com`,
        password: "InitialPassword123!"
    };

    let accessToken = "";
    let refreshToken = "";
    const testResults = [];

    function logTest(testName, passed, details = "") {
        testResults.push({ testName, passed, details });
        console.log(`${passed ? "✅ [PASS]" : "❌ [FAIL]"} - ${testName} ${details ? "(" + details + ")" : ""}`);
    }

    try {
        // --- 1. POST /register (Error case: missing fields) ---
        let res = await fetch(`${baseUrl}/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({})
        });
        let data = await res.json().catch(() => ({}));
        logTest("POST /register (Missing required fields)", res.status === 400, `Status: ${res.status}`);

        // --- 2. POST /register (Success case) ---
        const regForm = new FormData();
        regForm.append("fullName", testUser.fullName);
        regForm.append("username", testUser.username);
        regForm.append("email", testUser.email);
        regForm.append("password", testUser.password);
        regForm.append("avatar", new Blob([pngBuffer], { type: "image/png" }), "avatar.png");
        regForm.append("coverImage", new Blob([pngBuffer], { type: "image/png" }), "cover.png");

        res = await fetch(`${baseUrl}/register`, {
            method: "POST",
            body: regForm
        });
        data = await res.json().catch(() => ({}));
        logTest("POST /register (Valid registration)", res.status === 201 && !!data?.data?._id, `Status: ${res.status}`);

        // --- 3. POST /register (Error case: duplicate user) ---
        const dupForm = new FormData();
        dupForm.append("fullName", testUser.fullName);
        dupForm.append("username", testUser.username);
        dupForm.append("email", testUser.email);
        dupForm.append("password", testUser.password);
        dupForm.append("avatar", new Blob([pngBuffer], { type: "image/png" }), "avatar.png");

        res = await fetch(`${baseUrl}/register`, {
            method: "POST",
            body: dupForm
        });
        data = await res.json().catch(() => ({}));
        logTest("POST /register (Duplicate user check)", res.status === 409, `Status: ${res.status}`);

        // --- 4. POST /login (Error case: wrong password) ---
        res = await fetch(`${baseUrl}/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                username: testUser.username,
                password: "WrongPassword"
            })
        });
        logTest("POST /login (Invalid credentials check)", res.status === 401, `Status: ${res.status}`);

        // --- 5. POST /login (Success case) ---
        res = await fetch(`${baseUrl}/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                username: testUser.username,
                password: testUser.password
            })
        });
        data = await res.json().catch(() => ({}));
        accessToken = data?.data?.accessToken;
        refreshToken = data?.data?.refreshToken;
        logTest("POST /login (Successful login & token receipt)", res.status === 200 && !!accessToken && !!refreshToken, `Status: ${res.status}`);

        let authHeaders = {
            "Authorization": `Bearer ${accessToken}`,
            "Content-Type": "application/json"
        };

        // --- 6. GET /current-user (Success case) ---
        res = await fetch(`${baseUrl}/current-user`, {
            method: "GET",
            headers: authHeaders
        });
        data = await res.json().catch(() => ({}));
        logTest("GET /current-user (Fetched authenticated user)", res.status === 200 && data?.data?.username === testUser.username.toLowerCase(), `Status: ${res.status}`);

        // --- 7. PATCH /update-account (Success case) ---
        const updatedEmail = `new_${testUser.email}`;
        res = await fetch(`${baseUrl}/update-account`, {
            method: "PATCH",
            headers: authHeaders,
            body: JSON.stringify({
                fullName: "Updated Full Name",
                email: updatedEmail
            })
        });
        data = await res.json().catch(() => ({}));
        logTest("PATCH /update-account (Updated fullName & email)", res.status === 200 && data?.data?.email === updatedEmail.toLowerCase(), `Status: ${res.status}`);

        // --- 8. PATCH /avatar (Success case) ---
        const avatarForm = new FormData();
        avatarForm.append("avatar", new Blob([pngBuffer], { type: "image/png" }), "avatar_update.png");
        res = await fetch(`${baseUrl}/avatar`, {
            method: "PATCH",
            headers: { "Authorization": `Bearer ${accessToken}` },
            body: avatarForm
        });
        data = await res.json().catch(() => ({}));
        logTest("PATCH /avatar (Uploaded and updated avatar)", res.status === 200 && !!data?.data?.avatar, `Status: ${res.status}`);

        // --- 9. PATCH /cover-image (Success case) ---
        const coverForm = new FormData();
        coverForm.append("coverImage", new Blob([pngBuffer], { type: "image/png" }), "cover_update.png");
        res = await fetch(`${baseUrl}/cover-image`, {
            method: "PATCH",
            headers: { "Authorization": `Bearer ${accessToken}` },
            body: coverForm
        });
        data = await res.json().catch(() => ({}));
        logTest("PATCH /cover-image (Uploaded and updated cover image)", res.status === 200 && !!data?.data?.coverImage, `Status: ${res.status}`);

        // --- 10. GET /c/:username (Success case) ---
        res = await fetch(`${baseUrl}/c/${testUser.username}`, {
            method: "GET",
            headers: authHeaders
        });
        data = await res.json().catch(() => ({}));
        logTest("GET /c/:username (Channel profile aggregation)", res.status === 200 && data?.data?.username === testUser.username.toLowerCase() && "subscribersCount" in (data?.data || {}), `Status: ${res.status}`);

        // --- 11. GET /watch-history (Success case) ---
        res = await fetch(`${baseUrl}/watch-history`, {
            method: "GET",
            headers: authHeaders
        });
        data = await res.json().catch(() => ({}));
        logTest("GET /watch-history (Aggregated watch history)", res.status === 200 && Array.isArray(data?.data), `Status: ${res.status}`);

        // --- 12. POST /refresh-token (Success case) ---
        res = await fetch(`${baseUrl}/refresh-token`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ refreshToken })
        });
        data = await res.json().catch(() => ({}));
        const newAccessToken = data?.data?.accessToken;
        const newRefreshToken = data?.data?.refreshToken;
        logTest("POST /refresh-token (Returned new valid tokens)", res.status === 200 && !!newAccessToken && !!newRefreshToken && newRefreshToken !== "undefined", `Status: ${res.status}, refreshToken: ${newRefreshToken ? "valid" : "missing"}`);

        if (newAccessToken) {
            accessToken = newAccessToken;
            authHeaders["Authorization"] = `Bearer ${accessToken}`;
        }
        if (newRefreshToken) {
            refreshToken = newRefreshToken;
        }

        // --- 13. POST /change-password (Success case) ---
        const newPassword = "NewSecretPassword456!";
        res = await fetch(`${baseUrl}/change-password`, {
            method: "POST",
            headers: authHeaders,
            body: JSON.stringify({
                oldPassword: testUser.password,
                newPassword: newPassword
            })
        });
        data = await res.json().catch(() => ({}));
        logTest("POST /change-password (Changed password successfully)", res.status === 200, `Status: ${res.status}`);

        // Verify login with new password
        res = await fetch(`${baseUrl}/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                username: testUser.username,
                password: newPassword
            })
        });
        data = await res.json().catch(() => ({}));
        logTest("POST /login (Login with NEW password)", res.status === 200, `Status: ${res.status}`);

        if (data?.data?.accessToken) {
            accessToken = data.data.accessToken;
            authHeaders["Authorization"] = `Bearer ${accessToken}`;
        }

        // --- 14. POST /logout (Success case & DB check) ---
        res = await fetch(`${baseUrl}/logout`, {
            method: "POST",
            headers: authHeaders
        });
        data = await res.json().catch(() => ({}));
        logTest("POST /logout (Logout request success)", res.status === 200, `Status: ${res.status}`);

        // Verify refreshToken was actually removed/unset from DB
        const dbUser = await User.findOne({ username: testUser.username.toLowerCase() });
        const isRefreshTokenUnset = dbUser && (dbUser.refreshToken === undefined || dbUser.refreshToken === null);
        logTest("POST /logout (Verify refreshToken unset in MongoDB)", isRefreshTokenUnset, `DB refreshToken: ${dbUser?.refreshToken}`);

        // --- 15. Verify refreshed token rejected after logout ---
        res = await fetch(`${baseUrl}/refresh-token`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ refreshToken })
        });
        logTest("POST /refresh-token (Rejected after logout)", res.status === 401, `Status: ${res.status}`);

    } catch (err) {
        console.error("Test execution error:", err);
    } finally {
        console.log(`\n========================================`);
        const total = testResults.length;
        const passed = testResults.filter(t => t.passed).length;
        const failed = total - passed;
        console.log(`RESULTS: ${passed}/${total} PASSED, ${failed} FAILED`);
        console.log(`========================================\n`);

        server.close();
        process.exit(failed > 0 ? 1 : 0);
    }
}

runFullTestSuite();
