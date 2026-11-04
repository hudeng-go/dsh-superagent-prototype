import { describe, expect, it } from 'vitest'
import { inOrganization, isIssueTarget, isRepository, parseTargetKey, parseThreadId, targetKey, targetLabel, targetOf,
  threadId, threadKeyOf } from '../src/sources/github-ref.ts'

describe('GitHub Thread ids', () => {
  it('names the repository in every Thread id, because numbers repeat across repositories', () => {
    expect(threadId({ repository: 'acme/widgets', number: 7 })).toBe('acme/widgets:7')
    expect(threadId({ repository: 'acme/widgets', branch: 'main' })).toBe('acme/widgets:ci:main')
    expect(threadKeyOf({ repository: 'acme/widgets', number: 7 })).toBe('github:acme/widgets:7')
    // Two repositories may both have a pull request 7 and must not share a Thread.
    expect(threadKeyOf({ repository: 'acme/widgets', number: 7 })).not.toBe(threadKeyOf({ repository: 'acme/gadgets', number: 7 }))
  })
  it('parses a Thread id or a full Thread key back to its target, branch names included', () => {
    expect(parseThreadId('acme/widgets:7')).toEqual({ repository: 'acme/widgets', number: 7 })
    expect(parseThreadId('github:acme/widgets:7')).toEqual({ repository: 'acme/widgets', number: 7 })
    expect(parseThreadId('github:acme/widgets:ci:release/1.0')).toEqual({ repository: 'acme/widgets', branch: 'release/1.0' })
    expect(parseThreadId('acme/widgets:ci:')).toEqual({ repository: 'acme/widgets', branch: '' })
    expect(parseThreadId('acme/widgets')).toBeUndefined()
    expect(parseThreadId('acme/widgets:7:8')).toBeUndefined()
    expect(parseThreadId('not a repository:7')).toBeUndefined()
  })
  it('reads the Threads older versions stored, whose ids named no repository', () => {
    expect(parseThreadId('github:7')).toEqual({ repository: '', number: 7 })
    expect(parseThreadId('github:ci:main')).toEqual({ repository: '', branch: 'main' })
    // A fallback repository answers for them, so they keep working after the Source covers an organization.
    expect(targetOf('github:7', 'acme/widgets')).toEqual({ repository: 'acme/widgets', number: 7 })
    expect(targetOf('github:7')).toEqual({ repository: '', number: 7 })
    expect(targetOf('feishu:oc_1:om_1', 'acme/widgets')).toBeUndefined()
  })
  it('labels a target for health details, and keys one Issue or PR per repository', () => {
    expect(targetLabel({ repository: 'acme/widgets', number: 7 })).toBe('acme/widgets#7')
    expect(targetLabel({ repository: 'acme/widgets', branch: 'main' })).toBe('acme/widgets ci:main')
    expect(targetKey({ repository: 'acme/widgets', number: 7 })).toBe('acme/widgets#7')
    expect(parseTargetKey('acme/widgets#7')).toEqual({ repository: 'acme/widgets', number: 7 })
    expect(parseTargetKey('7')).toBeUndefined()
    expect(parseTargetKey('acme/widgets#0')).toBeUndefined()
  })
  it('recognizes repositories, organization membership and Issue/PR targets', () => {
    expect(isRepository('deepin-community/jq')).toBe(true)
    expect(isRepository('jq')).toBe(false)
    expect(inOrganization('deepin-community', 'deepin-community/jq')).toBe(true)
    // GitHub names are case-insensitive, and another organization's repository is out of scope.
    expect(inOrganization('deepin-community', 'Deepin-Community/JQ')).toBe(true)
    expect(inOrganization('acme', 'deepin-community/jq')).toBe(false)
    expect(inOrganization('', 'deepin-community/jq')).toBe(false)
    expect(isIssueTarget({ repository: 'acme/widgets', number: 7 })).toBe(true)
    expect(isIssueTarget({ repository: 'acme/widgets', branch: 'main' })).toBe(false)
  })
})
