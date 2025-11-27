// src/worker.js

// 获取 GitHub 最新 release
async function githubLatest(owner, repo, env) {
    const url = `https://api.github.com/repos/${owner}/${repo}/releases/latest`;
    const res = await fetch(url, {
        headers: {
            Authorization: `token ${env.GH_TOKEN}`,
            "User-Agent": "release-watch",
        },
    });
    if (res.status === 404) return null; // 无 release
    if (!res.ok) throw new Error(`GitHub ${res.status} ${await res.text()}`);
    return res.json();
}

// 发送 Bark 推送
async function barkPush(title, body, env) {
    const server = env.BARK_SERVER || "https://api.day.app"; // Default to official server if not set, or throw error? User wants to hide their domain, so likely custom. Let's just use the env.
    const url = `${env.BARK_SERVER}/${env.BARK_KEY}/${encodeURIComponent(title)}/${encodeURIComponent(body)}`;
    const res = await fetch(url);
    if (!res.ok) console.warn("Bark push failed", res.status);
}

async function checkReleases(env) {
    console.log("Starting release poll script...");

    if (!env.BARK_KEY || !env.GH_TOKEN || !env.BARK_SERVER) {
        throw new Error("Missing required environment variables: BARK_KEY, GH_TOKEN, BARK_SERVER");
    }

    console.log("Fetching watchlist from D1...");
    const { results } = await env.DB.prepare("SELECT * FROM repos").all();
    console.log(`Found ${results.length} repositories to check.`);

    for (const row of results) {
        const { id, owner, repo, latest_tag } = row;
        console.log(`\nChecking ${owner}/${repo}...`);

        try {
            const release = await githubLatest(owner, repo, env);

            if (!release) {
                console.log(`No releases found for ${owner}/${repo}. Skipping.`);
                continue;
            }

            console.log(
                `Latest release tag is ${release.tag_name}. Previously seen tag was ${latest_tag || "none"}.`,
            );
            if (release.tag_name === latest_tag) {
                console.log("No new release. Skipping.");
                continue;
            }

            console.log(`New release found! Tag: ${release.tag_name}.`);
            const title = `${owner}/${repo} a new version ${release.tag_name}`;
            const body = (release.name || release.body || "").slice(0, 120);

            console.log("Sending Bark notification...");
            await barkPush(title, body, env);
            console.log("Bark notification sent.");

            console.log("Updating D1 with the new tag...");
            await env.DB.prepare(
                "UPDATE repos SET latest_tag = ?, updated_at = ? WHERE id = ?"
            )
                .bind(release.tag_name, new Date().toISOString(), id)
                .run();
            console.log("D1 updated successfully.");
        } catch (err) {
            console.error(`Error checking ${owner}/${repo}:`, err);
        }
    }
    console.log("\nPoll script finished successfully.");
}

export default {
    // Cron Trigger handler
    async scheduled(event, env, ctx) {
        ctx.waitUntil(checkReleases(env));
    },

    // HTTP handler for management API
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const path = url.pathname;
        const method = request.method;

        // Auth check (simple shared secret or just rely on Cloudflare Access if configured, 
        // but for now let's assume it's open or protected by env var if needed. 
        // Adding a simple query param auth for safety if desired, but keeping it simple for now as requested).

        if (path === "/repos" && method === "GET") {
            const { results } = await env.DB.prepare("SELECT * FROM repos").all();
            return Response.json(results);
        }

        if (path === "/repos" && method === "POST") {
            try {
                const { owner, repo } = await request.json();
                if (!owner || !repo) return new Response("Missing owner or repo", { status: 400 });

                const info = await env.DB.prepare(
                    "INSERT INTO repos (owner, repo, updated_at) VALUES (?, ?, ?)"
                )
                    .bind(owner, repo, new Date().toISOString())
                    .run();

                return Response.json({ success: true, info }, { status: 201 });
            } catch (err) {
                return new Response(err.message, { status: 500 });
            }
        }

        if (path === "/repos" && method === "DELETE") {
            try {
                const { id } = await request.json();
                if (!id) return new Response("Missing id", { status: 400 });

                const info = await env.DB.prepare("DELETE FROM repos WHERE id = ?").bind(id).run();
                return Response.json({ success: true, info });
            } catch (err) {
                return new Response(err.message, { status: 500 });
            }
        }

        // Manual trigger
        if (path === "/trigger") {
            ctx.waitUntil(checkReleases(env));
            return new Response("Triggered release check manually.", { status: 200 });
        }

        return new Response("Not Found", { status: 404 });
    },
};
