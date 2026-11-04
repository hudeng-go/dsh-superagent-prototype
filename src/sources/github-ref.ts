/** Repository-aware GitHub identifiers: Thread keys, Channel addresses, and the repository a Thread or Trigger belongs to. */
export const SOURCE = 'github'

/** A repository, optionally naming the Issue/PR number or the branch whose CI the Thread tracks. */
export interface GithubTarget { repository: string; number?: number; branch?: string }

const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/
/** True when `value` is a GitHub `owner/name` repository reference. */
export const isRepository = (value: string): boolean => REPOSITORY.test(value)
/** True when `repository` belongs to `organization`, which is how the Source decides that a Trigger is in scope. */
export const inOrganization = (organization: string, repository: string): boolean =>
  !!organization && repository.slice(0, repository.indexOf('/')).toLowerCase() === organization.toLowerCase() && isRepository(repository)

/**
 * Thread id of a target: `<owner>/<name>:<number>` for an Issue or PR, and `<owner>/<name>:ci:<branch>` for a branch's
 * CI. Issue and PR numbers repeat across repositories, so the repository is part of the identity. This is the Source's
 * native id, which `threadKey` prefixes with `github:` to form the Thread key.
 */
export function threadId(target: GithubTarget): string {
  const tail = target.number === undefined ? `ci:${target.branch ?? ''}` : String(target.number)
  return `${target.repository}:${tail}`
}
/** Thread key of a target (which `src/core/model.ts` forms as `<source>:<id>`), for the Store, triggers, and tickets. */
export const threadKeyOf = (target: GithubTarget): string => `${SOURCE}:${threadId(target)}`
const idOf = (thread: string): string => thread.startsWith(`${SOURCE}:`) ? thread.slice(SOURCE.length + 1) : thread
/**
 * Parses a Thread id into its target, accepting both the Source's native id and a full Thread key. Ids written before the
 * Source covered a whole organization name no repository, which an empty `repository` reports so the caller can fall back
 * to the deployment's fixed repository.
 */
export function parseThreadId(id: string): GithubTarget | undefined {
  const rest = idOf(id)
  // Legacy `github:<number>` and `github:ci:<branch>` Threads named no repository.
  if (/^[1-9]\d*$/.test(rest)) return { repository: '', number: Number(rest) }
  if (rest.startsWith('ci:')) return { repository: '', branch: rest.slice('ci:'.length) }
  // The repository is the longest prefix of two path segments, so the tail may itself hold colons (a branch name).
  const colon = rest.indexOf(':')
  if (colon < 0) return undefined
  const repository = rest.slice(0, colon)
  if (!isRepository(repository)) return undefined
  const tail = rest.slice(colon + 1)
  if (/^[1-9]\d*$/.test(tail)) return { repository, number: Number(tail) }
  if (tail.startsWith('ci:')) return { repository, branch: tail.slice('ci:'.length) }
  return undefined
}
/** Target of a Thread id, using `fallback` for a legacy id that names no repository; undefined when the id is not a GitHub Thread id. */
export function targetOf(id: string, fallback = ''): GithubTarget | undefined {
  const target = parseThreadId(id)
  if (!target) return undefined
  return { ...target, repository: target.repository || fallback }
}
/** A target that names an Issue or PR, which is what reading, replying, and CI polling need. */
export type GithubIssueTarget = GithubTarget & { number: number }

/** True when a target names an Issue or PR rather than a branch's CI. */
export const isIssueTarget = (target: GithubTarget): target is GithubIssueTarget => typeof target.number === 'number'
/** Name of a target in health details and poll errors: `owner/name#12` or `owner/name ci:main`. */
export function targetLabel(target: GithubTarget): string {
  const place = target.repository || 'github'
  return target.number === undefined ? `${place} ci:${target.branch ?? ''}` : `${place}#${target.number}`
}
/** Key that distinguishes one Issue or PR from another across repositories, for per-round maps and KV names. */
export const targetKey = (target: GithubIssueTarget): string => `${target.repository}#${target.number}`
/** Target a `targetKey` names; a repository name never contains `#`, so the last one separates it from the number. */
export function parseTargetKey(key0: string): GithubIssueTarget | undefined {
  const at = key0.lastIndexOf('#')
  if (at < 1) return undefined
  const repository = key0.slice(0, at)
  const number = Number(key0.slice(at + 1))
  return isRepository(repository) && Number.isSafeInteger(number) && number > 0 ? { repository, number } : undefined
}
