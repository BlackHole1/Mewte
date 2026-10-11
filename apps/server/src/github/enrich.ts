import type { DataNeed, RuleContext, RuleUser, SubjectState } from "@mewte/shared";
import { apiUrlToHtmlUrl, type GitHubClient, GitHubError, type GitHubNotification } from "./client";

/** Stores looked-up GitHub data for a short while, keyed per account by the caller. */
export interface EnrichmentCache {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string): Promise<void>;
}

interface RestUser {
  login: string;
  type?: string;
}

interface SubjectInfo {
  author?: RuleUser | undefined;
  assignees?: string[] | undefined;
  labels?: string[] | undefined;
  state?: SubjectState | undefined;
  requestedReviewers?: string[] | undefined;
  htmlUrl?: string | undefined;
}

interface DiscussionInfo extends SubjectInfo {
  commenters: string[];
  lastCommenter?: RuleUser | undefined;
}

interface Review {
  login: string;
  hasBody: boolean;
}

function toUser(user: RestUser | null | undefined): RuleUser | undefined {
  if (!user?.login) return undefined;
  return { login: user.login, isBot: user.type === "Bot" || user.login.endsWith("[bot]") };
}

function logins(users: (RestUser | null | undefined)[] | undefined): string[] {
  return unique((users ?? []).map((user) => user?.login).filter((login) => login !== undefined));
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

// ---------- REST subjects ----------

interface RestSubject {
  html_url?: string;
  user?: RestUser | null;
  author?: RestUser | null;
  assignees?: RestUser[];
  labels?: ({ name?: string } | string)[];
  state?: string;
  draft?: boolean;
  merged?: boolean;
  merged_at?: string | null;
  requested_reviewers?: RestUser[];
}

function subjectState(type: string, body: RestSubject): SubjectState | undefined {
  if (type === "PullRequest") {
    if (body.merged || body.merged_at) return "merged";
    if (body.state === "closed") return "closed";
    if (body.draft) return "draft";
    return body.state === "open" ? "open" : undefined;
  }
  if (type === "Issue") {
    return body.state === "open" || body.state === "closed" ? body.state : undefined;
  }
  return undefined;
}

function toSubjectInfo(type: string, body: RestSubject): SubjectInfo {
  const info: SubjectInfo = {
    author: toUser(body.user ?? body.author),
    htmlUrl: body.html_url,
  };
  if (type === "Issue" || type === "PullRequest") {
    info.assignees = logins(body.assignees);
    info.labels = unique(
      (body.labels ?? [])
        .map((label) => (typeof label === "string" ? label : label.name))
        .filter((name) => name !== undefined),
    );
    info.state = subjectState(type, body);
  }
  if (type === "PullRequest") info.requestedReviewers = logins(body.requested_reviewers);
  return info;
}

// ---------- Discussions (GraphQL only) ----------

interface GqlActor {
  login: string;
  __typename: string;
}

interface GqlPage<T> {
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
  nodes: T[];
}

interface GqlReply {
  author: GqlActor | null;
  createdAt: string;
}

interface GqlComment extends GqlReply {
  id: string;
  replies: GqlPage<GqlReply>;
}

interface GqlDiscussion {
  id: string;
  title: string;
  url: string;
  closed: boolean;
  /** `null` in categories that cannot have an accepted answer. */
  isAnswered: boolean | null;
  updatedAt: string;
  author: GqlActor | null;
  labels: { nodes: { name: string }[] };
  comments: GqlPage<GqlComment>;
}

const REPLY_FIELDS = "author { login __typename } createdAt";
const COMMENT_FIELDS = `id ${REPLY_FIELDS} replies(first: 100) { pageInfo { hasNextPage endCursor } nodes { ${REPLY_FIELDS} } }`;
const COMMENTS = `comments(first: 100, after: $after) { pageInfo { hasNextPage endCursor } nodes { ${COMMENT_FIELDS} } }`;

const DISCUSSION_SEARCH = `query ($q: String!, $after: String) {
  search(query: $q, type: DISCUSSION, first: 10) {
    nodes { ... on Discussion { id title url closed isAnswered updatedAt author { login __typename } labels(first: 100) { nodes { name } } ${COMMENTS} } }
  }
}`;

const DISCUSSION_COMMENTS = `query ($id: ID!, $after: String) {
  node(id: $id) { ... on Discussion { ${COMMENTS} } }
}`;

const COMMENT_REPLIES = `query ($id: ID!, $after: String) {
  node(id: $id) { ... on DiscussionComment { replies(first: 100, after: $after) { pageInfo { hasNextPage endCursor } nodes { ${REPLY_FIELDS} } } } }
}`;

/** GraphQL reports apps without the `[bot]` suffix that REST uses. Align the two. */
function gqlUser(actor: GqlActor | null): RuleUser | undefined {
  if (!actor?.login) return undefined;
  const isBot = actor.__typename === "Bot";
  const login = isBot && !actor.login.endsWith("[bot]") ? `${actor.login}[bot]` : actor.login;
  return { login, isBot };
}

async function loadDiscussion(
  client: GitHubClient,
  notification: GitHubNotification,
): Promise<DiscussionInfo | null> {
  // Discussion notifications carry no URL, so the thread is found by title.
  const title = notification.subject.title;
  const q = `repo:${notification.repository.full_name} in:title "${title.replace(/["\\]/g, " ")}"`;
  const found = await client.graphql<{ search: { nodes: Partial<GqlDiscussion>[] } }>(
    DISCUSSION_SEARCH,
    { q, after: null },
  );
  const target = Date.parse(notification.updated_at);
  const discussion = found.search.nodes
    .filter((node): node is GqlDiscussion => node.id !== undefined && node.title === title)
    .toSorted(
      (a, b) =>
        Math.abs(Date.parse(a.updatedAt) - target) - Math.abs(Date.parse(b.updatedAt) - target),
    )[0];
  if (!discussion) return null;

  const entries: GqlReply[] = [];
  const collect = async (comment: GqlComment) => {
    entries.push(comment, ...comment.replies.nodes);
    let page = comment.replies.pageInfo;
    while (page.hasNextPage) {
      const more = await client.graphql<{ node: { replies: GqlPage<GqlReply> } }>(COMMENT_REPLIES, {
        id: comment.id,
        after: page.endCursor,
      });
      entries.push(...more.node.replies.nodes);
      page = more.node.replies.pageInfo;
    }
  };

  let comments = discussion.comments;
  for (;;) {
    for (const comment of comments.nodes) await collect(comment);
    if (!comments.pageInfo.hasNextPage) break;
    const more = await client.graphql<{ node: { comments: GqlPage<GqlComment> } }>(
      DISCUSSION_COMMENTS,
      { id: discussion.id, after: comments.pageInfo.endCursor },
    );
    comments = more.node.comments;
  }

  const latest = entries.toSorted((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];
  return {
    author: gqlUser(discussion.author),
    labels: unique(discussion.labels.nodes.map((label) => label.name)),
    state: discussion.closed ? "closed" : discussion.isAnswered ? "answered" : "open",
    htmlUrl: discussion.url,
    commenters: unique(
      entries.map((entry) => gqlUser(entry.author)?.login).filter((login) => login !== undefined),
    ),
    lastCommenter: latest ? gqlUser(latest.author) : undefined,
  };
}

// ---------- enricher ----------

export interface Enricher {
  /** The rule context. `load` fills in more of it in place. */
  readonly context: RuleContext;
  /** Fetches one kind of extra data, unless it is already loaded. */
  load(need: DataNeed): Promise<void>;
  /** Best known link to the subject for a person to open. */
  htmlUrl(): string;
}

export function baseContext(notification: GitHubNotification): RuleContext {
  return {
    repo: notification.repository.full_name,
    owner: notification.repository.owner.login,
    reason: notification.reason,
    subjectType: notification.subject.type,
    title: notification.subject.title,
  };
}

export function createEnricher(input: {
  client: GitHubClient;
  cache: EnrichmentCache;
  notification: GitHubNotification;
}): Enricher {
  const { client, cache, notification } = input;
  const { subject } = notification;
  const context = baseContext(notification);
  const loaded = new Set<DataNeed>();
  const memo = new Map<string, Promise<unknown>>();
  let htmlUrl: string | undefined;

  /**
   * Caches one lookup. `null` records that the resource is not visible to this token, so
   * a private repository without the `repo` scope is not re-requested on every poll.
   */
  function cached<T>(key: string, loader: () => Promise<T | null>): Promise<T | null> {
    const existing = memo.get(key);
    if (existing) return existing as Promise<T | null>;
    const pending = (async () => {
      const hit = await cache.get(key);
      if (hit !== undefined) return (JSON.parse(hit) as { v: T | null }).v;
      let value: T | null;
      try {
        value = await loader();
      } catch (error) {
        if (!(error instanceof GitHubError) || !error.unavailable) throw error;
        value = null;
      }
      await cache.set(key, JSON.stringify({ v: value }));
      return value;
    })();
    memo.set(key, pending);
    return pending;
  }

  const discussion = () =>
    cached(`discussion:${notification.repository.full_name}:${subject.title}`, () =>
      loadDiscussion(client, notification),
    );

  const subjectInfo = (): Promise<SubjectInfo | null> => {
    if (subject.type === "Discussion") return discussion();
    const url = subject.url;
    if (!url) return Promise.resolve(null);
    return cached(`subject:${url}`, async () =>
      toSubjectInfo(subject.type, await client.getJson<RestSubject>(url)),
    );
  };

  const authors = (key: string, url: string) =>
    cached(`${key}:${url}`, async () =>
      logins((await client.getAllPages<{ user: RestUser | null }>(url)).map((item) => item.user)),
    );

  const reviews = (pullUrl: string) =>
    cached(`reviews:${pullUrl}`, async () =>
      (
        await client.getAllPages<{ user: RestUser | null; body?: string | null }>(
          `${pullUrl}/reviews`,
        )
      )
        .filter((review) => review.user?.login)
        .map((review): Review => ({
          login: review.user!.login,
          hasBody: Boolean(review.body?.trim()),
        })),
    );

  async function loadSubject(): Promise<void> {
    const info = await subjectInfo();
    if (!info) return;
    context.author = info.author;
    context.assignees = info.assignees;
    context.labels = info.labels;
    context.state = info.state;
    htmlUrl = info.htmlUrl ?? htmlUrl;
  }

  async function loadActor(): Promise<void> {
    if (subject.type === "Discussion") {
      const info = await discussion();
      context.actor = info?.lastCommenter ?? info?.author;
      return;
    }
    const url = subject.latest_comment_url;
    if (url && url !== subject.url) {
      const comment = await cached(`comment:${url}`, async () => {
        const body = await client.getJson<{ user?: RestUser | null; author?: RestUser | null }>(
          url,
        );
        return { user: toUser(body.user ?? body.author) };
      });
      if (comment?.user) {
        context.actor = comment.user;
        return;
      }
    }
    // No separate comment: whoever opened the subject triggered the notification.
    context.actor = (await subjectInfo())?.author;
  }

  async function loadReviews(): Promise<void> {
    if (subject.type !== "PullRequest" || !subject.url) return;
    const [info, submitted] = await Promise.all([subjectInfo(), reviews(subject.url)]);
    if (!info || !submitted) return;
    context.reviewers = unique([
      ...(info.requestedReviewers ?? []),
      ...submitted.map((review) => review.login),
    ]);
  }

  async function loadComments(): Promise<void> {
    const url = subject.url;
    if (subject.type === "Discussion") {
      context.commenters = (await discussion())?.commenters;
    } else if (subject.type === "Issue" && url) {
      context.commenters = (await authors("comments", `${url}/comments`)) ?? undefined;
    } else if (subject.type === "Commit" && url) {
      context.commenters = (await authors("comments", `${url}/comments`)) ?? undefined;
    } else if (subject.type === "PullRequest" && url) {
      // A pull request collects comments in three places: the conversation, inline review
      // comments, and the summary text of submitted reviews.
      const [conversation, inline, submitted] = await Promise.all([
        authors("comments", `${url.replace(/\/pulls\/(\d+)$/, "/issues/$1")}/comments`),
        authors("comments", `${url}/comments`),
        reviews(url),
      ]);
      if (!conversation || !inline || !submitted) return;
      context.commenters = unique([
        ...conversation,
        ...inline,
        ...submitted.filter((review) => review.hasBody).map((review) => review.login),
      ]);
    }
  }

  const loaders: Record<DataNeed, () => Promise<void>> = {
    subject: loadSubject,
    actor: loadActor,
    reviews: loadReviews,
    comments: loadComments,
  };

  return {
    context,
    async load(need) {
      if (loaded.has(need)) return;
      await loaders[need]();
      loaded.add(need);
    },
    htmlUrl: () => htmlUrl ?? apiUrlToHtmlUrl(subject.url, notification.repository.html_url),
  };
}
