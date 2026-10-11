/**
 * A stand-in GitHub API for trying Mewte without a real token.
 *
 *   bun apps/server/src/testing/demo.ts            # listens on :3999
 *   GITHUB_API_URL=http://localhost:3999 bun run dev
 *
 * Connect an account with the token printed at startup.
 */
import { FakeGitHub } from "./fake-github";

const port = Number(process.env.DEMO_GITHUB_PORT ?? 3999);
const origin = `http://localhost:${port}`;
const github = new FakeGitHub(origin);
const token = "ghp_valid_token_0000000000";

// The stand-in account gets a real picture so the interface looks like it does in use.
github.users.get(token)!.avatarUrl = "https://avatars.githubusercontent.com/u/583231?v=4";

const samples = [
  {
    repo: "acme/widgets",
    type: "PullRequest",
    title: "chore(deps): bump lodash from 4.17.20 to 4.17.21",
    reason: "subscribed",
    bot: true,
    state: "merged",
  },
  {
    repo: "acme/widgets",
    type: "PullRequest",
    title: "Add dark mode to the settings page",
    reason: "review_requested",
    bot: false,
    state: "open",
  },
  {
    repo: "acme/widgets",
    type: "Issue",
    title: "Crash when the config file is missing",
    reason: "mention",
    bot: false,
    state: "open",
  },
  {
    repo: "acme/api",
    type: "PullRequest",
    title: "chore(deps): update dependency typescript to v7",
    reason: "subscribed",
    bot: true,
    state: "closed",
  },
  {
    repo: "acme/api",
    type: "Issue",
    title: "Rate limiter returns 500 instead of 429",
    reason: "assign",
    bot: false,
    state: "closed",
  },
  {
    repo: "octo/docs",
    type: "PullRequest",
    title: "Fix typo in the installation guide",
    reason: "author",
    bot: false,
    state: "merged",
  },
  {
    repo: "octo/docs",
    type: "Release",
    title: "v2.4.0",
    reason: "subscribed",
    bot: true,
    state: undefined,
  },
  {
    repo: "octo/cli",
    type: "PullRequest",
    title: "Bump actions/checkout from 5 to 6",
    reason: "ci_activity",
    bot: true,
    state: "open",
  },
];

const discussions = [
  {
    repo: "acme/widgets",
    title: "How do I theme the date picker?",
    reason: "subscribed",
    closed: false,
    isAnswered: true,
    label: "question",
  },
  {
    repo: "octo/docs",
    title: "RFC: move the documentation to a monorepo",
    reason: "mention",
    closed: false,
    isAnswered: null,
    label: "rfc",
  },
];

// A title long enough to show how the interface copes with one.
samples.push({
  repo: "acme/platform-infrastructure-and-deployment-tooling",
  type: "PullRequest",
  title:
    "feat(deploy): add blue-green rollout strategy with automatic rollback on failed health checks, configurable traffic shifting steps, per-region overrides and a dry-run mode that prints the full execution plan before anything changes",
  reason: "review_requested",
  bot: false,
  state: "merged",
});

discussions.forEach((discussion, index) => {
  github.addNotification({
    id: String(2000 + index),
    repo: discussion.repo,
    type: "Discussion",
    title: discussion.title,
    reason: discussion.reason,
    // GitHub sends no subject URL for discussions; Mewte looks them up by title.
    subjectPath: null,
    updatedAt: new Date(Date.now() - (index + 1) * 1_800_000).toISOString(),
  });
});

github.graphql = ({ body }) => {
  const { variables } = body as { variables: { q?: string } };
  const nodes = discussions
    .filter((discussion) => variables.q?.includes(discussion.title))
    .map((discussion, index) => ({
      id: `D_${index}`,
      title: discussion.title,
      url: `https://github.com/${discussion.repo}/discussions/${index + 1}`,
      closed: discussion.closed,
      isAnswered: discussion.isAnswered,
      updatedAt: new Date().toISOString(),
      author: { login: "octocat", __typename: "User" },
      labels: { nodes: [{ name: discussion.label }] },
      comments: {
        pageInfo: { hasNextPage: false, endCursor: null },
        nodes: [
          {
            id: `DC_${index}`,
            author: { login: "hubot", __typename: "User" },
            createdAt: new Date().toISOString(),
            replies: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [] },
          },
        ],
      },
    }));
  return { data: { search: { nodes } } };
};

samples.forEach((sample, index) => {
  const id = String(1000 + index);
  const kind =
    sample.type === "PullRequest" ? "pulls" : sample.type === "Issue" ? "issues" : "releases";
  const path = `${kind}/${index + 1}`;
  github.addNotification({
    id,
    repo: sample.repo,
    type: sample.type,
    title: sample.title,
    reason: sample.reason,
    subjectPath: path,
    updatedAt: new Date(Date.now() - index * 3_600_000).toISOString(),
  });
  const user = sample.bot
    ? { login: "dependabot[bot]", type: "Bot" }
    : { login: "octocat", type: "User" };
  github.resource(`${sample.repo}/${path}`, {
    html_url: `https://github.com/${sample.repo}/${kind === "pulls" ? "pull" : kind}/${index + 1}`,
    user,
    author: user,
    state: sample.state === "merged" ? "closed" : sample.state,
    merged: sample.state === "merged",
    labels: sample.bot ? [{ name: "dependencies" }] : [{ name: "bug" }],
    assignees: [],
    requested_reviewers: [],
  });
});

Bun.serve({
  port,
  async fetch(request) {
    const body =
      request.method === "GET" || request.method === "HEAD" ? undefined : await request.text();
    const url = new URL(request.url);
    return github.fetch(`${origin}${url.pathname}${url.search}`, {
      method: request.method,
      headers: request.headers,
      body: body || undefined,
    });
  },
});

console.log(`Fake GitHub API on ${origin}`);
console.log(`Use this as the personal access token: ${token}`);
