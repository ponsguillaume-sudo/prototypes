#!/usr/bin/env node
/**
 * Node script to generate prototypes.json in repository root.
 * Uses GITHUB_TOKEN from the Actions environment.
 */
const fs = require('fs');
const https = require('https');

const repo = process.env.GITHUB_REPOSITORY;
if (!repo) {
  console.error('GITHUB_REPOSITORY not set');
  process.exit(1);
}
const [owner, repoName] = repo.split('/');
const token = process.env.GITHUB_TOKEN;
if (!token) {
  console.error('GITHUB_TOKEN not available');
  process.exit(1);
}

function ghFetch(path) {
  const options = {
    hostname: 'api.github.com',
    path,
    method: 'GET',
    headers: {
      'User-Agent': 'generate-prototypes-script',
      Accept: 'application/vnd.github.v3+json',
      Authorization: `token ${token}`,
    },
  };
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

(async () => {
  try {
    const contents = await ghFetch(`/repos/${owner}/${repoName}/contents?ref=main`);
    if (contents.status !== 200) throw new Error(`Failed to list contents: ${contents.status}`);
    const htmlFiles = contents.body
      .filter((f) => f.type === 'file' && f.name.endsWith('.html') && f.name !== 'index.html')
      .map((f) => ({ name: f.name, size: f.size }));

    const filesWithDates = await Promise.all(htmlFiles.map(async (file) => {
      const commitsRes = await ghFetch(`/repos/${owner}/${repoName}/commits?path=${encodeURIComponent(file.name)}&per_page=100`);
      if (commitsRes.status !== 200 || !Array.isArray(commitsRes.body) || commitsRes.body.length === 0) {
        return { ...file, createdAt: null, lastModified: null };
      }
      const commits = commitsRes.body;
      return {
        ...file,
        createdAt: commits[commits.length - 1].commit.committer.date,
        lastModified: commits[0].commit.committer.date,
      };
    }));

    const out = { generatedAt: new Date().toISOString(), files: filesWithDates };
    fs.writeFileSync('prototypes.json', JSON.stringify(out, null, 2));
    console.log('prototypes.json generated, files:', filesWithDates.length);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();