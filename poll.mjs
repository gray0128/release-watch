// poll.mjs

const NOCO_URL =
  "https://nocodb.987887.xyz/api/v2/tables/maat50ajcheeohw/records";
const NOCO_TOKEN = process.env.NOCODB_TOKEN;
const BARK_KEY = process.env.BARK_KEY;
const GH_TOKEN = process.env.GH_TOKEN;

// 统一封装 NocoDB 请求
async function nocodb(method, body) {
  const res = await fetch(NOCO_URL, {
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
  const { list } = await nocodb("GET");
  for (const row of list) {
    const { id, owner, repo, latest_tag } = row;
    const release = await githubLatest(owner, repo);
    if (!release) continue; // 仓库无 release
    if (release.tag_name === latest_tag) continue;

    // 推送到 Bark
    const title = `${owner}/${repo} 发布了 ${release.tag_name}`;
    const body = (release.name || release.body || "").slice(0, 120);
    await barkPush(title, body);

    // 更新 NocoDB 记录
    await nocodb("PATCH", {
      records: [
        {
          id,
          latest_tag: release.tag_name,
          updated_at: new Date().toISOString(),
        },
      ],
    });
  }
})();
