---
name: research
description: Use when answering questions that depend on external documentation, current API behavior, version-sensitive facts, or synthesized web research
---

# External Research

## Overview

Guessing about external systems creates false confidence. Link-dumping is not research.

**Core principle:** Verified external evidence before conclusions.

**Violating the letter of this process is violating the spirit of research.**

## The Iron Law

```
NO EXTERNAL FACT CLAIMS WITHOUT SOURCE VERIFICATION FIRST
```

If you have not checked a relevant source in this session, do not present the claim as settled fact.

## When to Use

Use for questions involving:
- Official documentation or API behavior
- Version-sensitive platform assumptions
- Current tool or ecosystem behavior outside the repository
- Synthesizing multiple web sources into a recommendation
- Screeps mechanics or runtime details that must be confirmed externally

In this repository, treat `https://docs.screeps.com/api` as the primary API source for Screeps API behavior unless the question specifically requires a different authoritative source.

**Do NOT use for:**
- Repository-local code exploration
- Questions answerable from workspace files alone
- Pure brainstorming without factual dependency
- Implementation work after the factual question is already resolved

## Research Checklist

Copy this checklist and track your progress:

```
Research Progress:
- [ ] Step 1: Confirm external research is required
- [ ] Step 2: Gather authoritative sources first
- [ ] Step 3: Record version, date, and scope
- [ ] Step 4: Cross-check material claims
- [ ] Step 5: Synthesize answer with uncertainty notes
```

## The Five Phases

You MUST complete each phase before proceeding to the next.

### Phase 1: Confirm External Research Is Required

**BEFORE searching externally:**

1. **Check whether the answer is already local**
   - Can the repository, docs, or current workspace answer this?
   - If yes, stop. Do not perform unnecessary web research.

2. **State the factual question clearly**
   - What exact claim needs verification?
   - What would change based on the answer?

3. **Identify sensitivity**
   - Is this version-sensitive?
   - Is this behavior-sensitive?
   - Is this a policy/opinion question rather than a factual one?

If you cannot state the question precisely, refine it before researching.

### Phase 2: Gather Sources

**Start with the strongest available evidence:**

1. **Prefer primary sources first**
   - Official documentation
   - Maintainer-authored references
   - Release notes or versioned API docs
   - Source code or authoritative specifications when appropriate

   **For this project:**
   - Start Screeps API questions with `https://docs.screeps.com/api`
   - Use other sources only to clarify, cross-check, or cover gaps that the primary API docs do not answer

2. **Use secondary sources carefully**
   - Forum posts, blogs, issue threads, and Q&A can help
   - They do NOT override official docs unless the official docs are silent or outdated

3. **Gather the minimum useful set**
   - Do not collect sources aimlessly
   - Stop when the question can be answered with evidence

### Phase 3: Verify Context

**Before drawing conclusions, record context for each important source:**

1. **Version**
   - What product, API, or game version does the source describe?

2. **Date**
   - Is the source current enough for this question?

3. **Scope**
   - Does the source actually address this specific case, or only something similar?

4. **Authority**
   - Is this source normative, descriptive, or anecdotal?

If context is missing, say so. Do not hide it.

### Phase 4: Cross-Check Claims

**For any material claim that affects implementation or design:**

1. **Confirm against another source when practical**
   - Especially for behavior-sensitive, version-sensitive, or surprising claims

2. **Resolve conflicts explicitly**
   - If sources disagree, say they disagree
   - Prefer the more authoritative and more current source
   - If conflict remains unresolved, report uncertainty instead of inventing certainty

3. **Separate fact from inference**
   - Verified fact: directly supported by the source
   - Inference: reasonable conclusion drawn from evidence
   - Unknown: not established by the available sources

### Phase 5: Synthesize the Answer

**Research is not complete until the findings are synthesized into a usable answer.**

Your answer should usually contain:

1. **Direct answer first**
   - Lead with the conclusion, not the search process

2. **Key findings**
   - Summarize the evidence that supports the conclusion

3. **Uncertainty or risk notes**
   - Call out stale docs, source conflict, or missing verification

4. **Recommended next action**
   - If the evidence is incomplete, say what should be checked next

Do NOT dump links without synthesis.

## Red Flags - STOP and Follow Process

If you catch yourself thinking:
- "I already know how this works"
- "One source is probably enough"
- "This forum answer looks fine"
- "The docs are probably still current"
- "I can infer the rest"
- "I'll just give the user the links"
- "This sounds right even though I didn't verify the version"
- "The sources conflict, but I'll pick one without mentioning it"

**ALL of these mean: STOP. Return to the relevant phase.**

## Common Rationalizations

| Excuse | Reality |
|--------|---------|
| "I remember the API" | Memory is not verification. Check the source. |
| "This is probably unchanged" | Version-sensitive facts drift. Verify the version. |
| "A maintainer comment is good enough" | Maybe, but check whether newer official docs override it. |
| "The docs are vague, so I'll state my guess" | State the uncertainty, not the guess as fact. |
| "Links are enough for the user" | Research requires synthesis, not a pile of URLs. |
| "I only need one source" | For material claims, cross-check when practical. |

## Output Contract

When reporting research results:

1. Mark what is verified versus inferred when that distinction matters.
2. Name the version/date context for behavior-sensitive claims.
3. State unresolved uncertainty plainly.
4. Give a recommendation only after presenting the evidence basis.

## Quick Reference

| Phase | Key Activities | Success Criteria |
|-------|---------------|------------------|
| **1. Confirm need** | Distinguish local vs external question | Research is actually necessary |
| **2. Gather sources** | Prefer authoritative sources | Enough evidence collected |
| **3. Verify context** | Check version, date, scope, authority | Sources fit the claim |
| **4. Cross-check** | Compare evidence, resolve conflicts | Claims are supported or uncertainty is explicit |
| **5. Synthesize** | Answer, evidence, risk, next action | User gets a usable conclusion |

## The Bottom Line

External research is only complete when the answer is evidence-backed, current enough for the question, and honest about uncertainty.