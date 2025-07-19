// poll.mjs
console.log("Starting release poll script...");

const NOCO_BASE_URL =
  "https://nocodb.987887.xyz/api/v2/tables/maat50ajcheeohw/records";
const NOCO_TOKEN = process.env.NOCODB_TOKEN;
const BARK_KEY = process.env.BARK_KEY;
const GH_TOKEN = process.env.GH_TOKEN;

// 统一封装 NocoDB 请求
async function nocodb(method, body, recordId = null) {
  const url = recordId ? `${NOCO_BASE_URL}/${recordId}` : NOCO_BASE_URL;
  const res = await fetch(url, {
    method,
    headers: {
      "xc-token": NOCO_TOKEN,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok)
    throw new Error(`NocoDB ${method} ${res.status} ${await res.text()}`);
  return res.json();
}

// 获取 GitHub 最新 release
async function githubLatest(owner, repo) {
  const url = `https://api.github.com/repos/${owner}/${repo}/releases/latest`;
  const res = await fetch(url, {
    headers: {
      Authorization: `token ${GH_TOKEN}`,
      "User-Agent": "release-watch",
    },
  });
  if (res.status === 404) return null; // 无 release
  if (!res.ok) throw new Error(`GitHub ${res.status} ${await res.text()}`);
  return res.json();
}

// 发送 Bark 推送
async function barkPush(title, body) {
  const url = `https://bark-cf.bobocai.win/${BARK_KEY}/${encodeURIComponent(title)}/${encodeURIComponent(body)}`;
  const res = await fetch(url);
  if (!res.ok) console.warn("Bark push failed", res.status);
}

(async () => {
  try {
    console.log("Checking for required environment variables...");
    if (!NOCO_TOKEN || !BARK_KEY || !GH_TOKEN) {
      throw new Error(
        "Missing one or more required environment variables: NOCODB_TOKEN, BARK_KEY, GH_TOKEN",
      );
    }
    console.log("Environment variables seem OK.");

    console.log("Fetching watchlist from NocoDB...");
    const { list } = await nocodb("GET");
    console.log(`Found ${list.length} repositories to check.`);

    for (const row of list) {
      const { Id: id, owner, repo, latest_tag } = row;
      console.log(`\nChecking ${owner}/${repo}...`);

      console.log(
        `Fetching latest release from GitHub for ${owner}/${repo}...`,
      );
      const release = await githubLatest(owner, repo);

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
      await barkPush(title, body);
      console.log("Bark notification sent.");

      console.log("Updating NocoDB with the new tag...");
      await nocodb(
        "PATCH",
        {
          latest_tag: release.tag_name,
          updated_at: new Date().toISOString(),
        },
        id,
      );
      console.log("NocoDB updated successfully.");
    }
    console.log("\nPoll script finished successfully.");
  } catch (error) {
    console.error("An error occurred during script execution:");
    console.error(error);
    process.exit(1); // Explicitly exit with a failure code
  }
})();
