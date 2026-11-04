/** GitHub outbound channel: posts issue/PR comments and review thread replies under the agent account. */
import { z } from 'zod'
import type { OutboundMessage } from '../core/index.ts'
import { CliError } from '../infra/commands.ts'
import { sameName } from '../infra/text.ts'
import type { SourceContext } from './host.ts'
import { isRepository, targetOf } from './github-ref.ts'
import type { ChannelLink, ChannelLinks } from './kind.ts'
import { githubAddress, githubPage, githubRepositoryOf } from './github-trigger.ts'

const CommentSchema = z.looseObject({
  id: z.number(), body: z.string().nullish(), in_reply_to_id: z.number().nullish(), user: z.looseObject({ login: z.string() }).nullish(),
})
/** True when an issue is permanently deleted (410) or locked (403); 404 is retried because it can indicate temporary permission loss on a private repo. */
const gone = (error: unknown): boolean => error instanceof CliError
  && (error.code === 410 || (error.code === 403 && /locked/i.test(error.message)))
const missing = (error: unknown): boolean => error instanceof CliError && (error.code === 404 || error.code === 410)
/**
 * The repository a message's address names: the one the reply records, else the one its Thread key carries, else the one
 * in its URL, so replies queued before Thread keys carried a repository still reach it.
 */
export function channelRepository(host: Pick<SourceContext, 'commands'>, message: OutboundMessage): string {
  const recorded = message.channel.address.repository ?? ''
  const target = targetOf(message.channel.thread, host.commands.repository)
  const named: (string | undefined)[] = [recorded, target?.repository, githubRepositoryOf(message.channel.address.url ?? '')]
  return named.find((value): value is string => !!value && isRepository(value)) ?? host.commands.repository
}
/** Posts a comment or review-thread reply with an embedded HTML marker so retries do not create duplicate comments. */
export async function sendGithub(host: Pick<SourceContext, 'commands'>, message: OutboundMessage): Promise<'sent' | 'gone'> {
  const { github } = host.commands.deployment
  const repository = channelRepository(host, message)
  const commands = host.commands.forRepository(repository)
  const number = Number(message.channel.address.number)
  if (!number) throw new Error('Missing GitHub reply target')
  try {
    // Retained trigger URLs also route replies queued before thread-aware delivery.
    const address = githubAddress(message.channel.address.url ?? '', repository)
    let rootId: number | undefined
    if (address?.pr && address.discussion && address.number === number) {
      // Fall back to a top-level PR comment if the target inline review comment was deleted.
      const source = await commands.api(CommentSchema, `pulls/comments/${address.discussion}`)
        .catch((error: unknown) => { if (missing(error)) return undefined; throw error })
      rootId = source ? source.in_reply_to_id ?? source.id : undefined
    }
    const path = rootId === undefined ? `issues/${number}/comments` : `pulls/${number}/comments`
    const marker = `<!-- dsh-superagent:${message.id} -->`
    const mine = (comment: z.infer<typeof CommentSchema>) => sameName(comment.user?.login ?? '', github.login)
      && (rootId === undefined || comment.in_reply_to_id === rootId) && (comment.body ?? '').includes(marker)
    if ((await commands.pages(CommentSchema, path)).some(mine)) return 'sent'
    const target = rootId === undefined ? path : `${path}/${rootId}/replies`
    await commands.api(z.unknown(), target, '--method', 'POST', '-f', `body=${message.text}\n\n${marker}`)
    return 'sent'
  } catch (error) {
    if (gone(error)) return 'gone'
    throw error
  }
}
export function githubLink(address: Record<string, string>, links: ChannelLinks): ChannelLink {
  const number = address.number ?? ''
  // The address records its repository because the deployment's links name only a fallback for Threads without one.
  const repository = [address.repository ?? '', links.repository ?? ''].find((value): value is string => isRepository(value)) ?? ''
  const review = !!repository && !!githubAddress(address.url ?? '', repository)?.discussion
  return { url: address.url ?? (repository ? githubPage(repository, Number(number)) : ''),
    label: review ? { zh: `GitHub #${number} 的 review 讨论`, en: `Review discussion on GitHub #${number}` }
      : { zh: `GitHub #${number}`, en: `GitHub #${number}` } }
}
