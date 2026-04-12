# Gameplay Context Skills Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the first Project Imperium gameplay-context skills by creating `imperium-economy-context` and `imperium-logistics-context` under the existing workspace skill structure, with explicit cross-references and discovery-friendly descriptions.

**Architecture:** This rollout is a documentation-and-workflow change inside the existing orchestrator-first model. Both new skills live under `.github/skills/` using the same structural conventions as the current workspace skills, while keeping gameplay-domain knowledge separate from the `superpowers` process skill family. Validation is focused on skill discovery anchors, companion-skill directives, and narrow markdown-safe checks rather than TypeScript builds.

**Tech Stack:** Markdown skill files, repository skill conventions, focused PowerShell and `rg` validation, existing Git diff checks.

---

## File Structure

- [../specs/2026-04-12-gameplay-context-skills-design.md](../specs/2026-04-12-gameplay-context-skills-design.md)
  - Approved design spec for this rollout.
  - Reference source only for implementation; do not modify during the rollout unless a design defect is found.

- `.github/skills/imperium-economy-context/SKILL.md`
  - New gameplay-context skill for Project Imperium economic policy, reserve logic, recovery, and phase definitions.

- `.github/skills/imperium-logistics-context/SKILL.md`
  - New gameplay-context skill for Project Imperium resource transport, hauling topology, salvage flow, and routing constraints.

## Task 1: Create The Economy Context Skill

**Files:**
- Create: `.github/skills/imperium-economy-context/SKILL.md`

- [ ] **Step 1: Verify the economy skill does not already exist**

Run:
```powershell
Test-Path .github/skills/imperium-economy-context/SKILL.md
```

Expected:
- The command returns `False`.

- [ ] **Step 2: Verify the skill namespace does not already contain the new economy name**

Run:
```powershell
rg "^name: imperium-economy-context$" .github/skills -g SKILL.md
```

Expected:
- No matches are returned.

- [ ] **Step 3: Create `.github/skills/imperium-economy-context/SKILL.md` with the exact content below**

```diff
*** Begin Patch
*** Add File: .github/skills/imperium-economy-context/SKILL.md
---
name: imperium-economy-context
description: Use when designing room energy policy, reserve thresholds, recovery rules, spawn-service priorities, or controller upgrade pressure for Project Imperium.
---

# Imperium Economy Context

## Overview

Economy in Project Imperium defines what the room's energy system must achieve: room survival, spawn service, reserve stability, recovery sequencing, and sustainable upgrade pressure.

**Core principle:** Economy owns policy targets and phase intent. It does not own the physical hauling or routing used to satisfy those targets.

## When to Use

Use this skill when work involves:
- room energy policy
- reserve thresholds or reserve bands
- spawn and extension service priorities
- controller upgrade pressure
- workforce-loss recovery policy
- deciding economy phase transitions

Do not use this skill by itself when the task is mainly about:
- hauling topology
- transport routing
- source collection geometry
- storage, link, or terminal routing behavior

**REQUIRED COMPANION SKILL:** If designing the physical transport routing, hauling topology, source collection layout, or storage or link routing required to satisfy these economic thresholds, you MUST also load `imperium-logistics-context` before proceeding.

## Core Rules

- Economy continuity outranks speculative growth.
- Reserve policy must be explicit rather than implied by current storage contents.
- `Room.energyAvailable` and `Room.energyCapacityAvailable` are the primary room-service surfaces for spawn throughput.
- Upgrade pressure is discretionary when reserve stability or spawn service is not proven.
- Every economy phase must define a degraded mode for CPU pressure, workforce shortage, or post-loss recovery.

## Verified Constraints

- Sources regenerate every 300 ticks.
- Source output depends on room control state: owned or reserved rooms provide 3000 energy per source cycle, while unreserved rooms drop to 1500.
- `Room.energyAvailable` reports current spawn and extension serviceable energy.
- `Room.energyCapacityAvailable` reports the maximum spawn and extension service envelope.
- Controller downgrade pressure is exposed through `StructureController.ticksToDowngrade`.
- Storage becomes available at RCL 4 and materially changes reserve policy options.

## Phase Model

- Bootstrap economy: prioritize survival, spawn service, and extension fill over aggressive upgrading.
- Container economy: stabilize source-side capture and reduce dropped-energy waste before raising upgrade pressure.
- Storage economy: define explicit reserve bands and distinguish buffer energy from spendable energy.
- Link-assisted economy: treat link energy as a service-path optimization, not a replacement for reserve policy.
- Terminal-backed economy: keep terminal use subordinate to room stability unless the task is explicitly empire-scoped.

## Failure Modes

- spawn starvation caused by over-prioritizing controller upgrades
- extension underfill during creep replacement windows
- reserve collapse hidden by transient harvest income
- unstable recovery after workforce loss because survival and growth are not separated
- assuming transport capacity exists without checking logistics support

## Quick Reference

- First question: can the room keep spawns and extensions supplied reliably?
- Second question: what reserve band separates stable spend from emergency buffer?
- Third question: is controller upgrading competing with survival service?
- Fourth question: does the current economy phase have an explicit degraded mode?

## Handoff Expectations

Before relying on this skill, gather:
- room controller level
- current `Room.energyAvailable`
- current `Room.energyCapacityAvailable`
- visible storage, container, link, and terminal state if present
- visible controller downgrade state
- whether the question is room-local or empire-scoped