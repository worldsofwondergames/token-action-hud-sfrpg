# Token Action HUD Starfinder

Token Action HUD system module for the [Starfinder](https://github.com/worldsofwondergames/foundryvtt-starfinder) (`sfrpg`) system for Foundry VTT.

Token Action HUD puts a repositionable HUD of actions next to the selected token. This module tells it what a Starfinder actor can do.

## Status

**Design approved, not yet implemented.** No module code exists in this repository yet.

The design is in [`docs/superpowers/specs/2026-08-18-token-action-hud-sfrpg-design.md`](docs/superpowers/specs/2026-08-18-token-action-hud-sfrpg-design.md), and the work is tracked in [issue #1](https://github.com/worldsofwondergames/token-action-hud-sfrpg/issues/1).

## Scope

The first version covers the `character` and `mech` actor types. The other five — `npc2`, `drone`, `starship`, `vehicle`, `hazard` — are candidates for a later version.

## Design

Every action calls an existing `sfrpg` entry point rather than reimplementing a roll, so a HUD roll behaves identically to the same roll from the sheet.

The dependency runs one way: this module reads `game.sfrpg` and `CONFIG.SFRPG`, and the `sfrpg` system contains no reference to Token Action HUD.

## Requirements

| | |
|---|---|
| Starfinder system | 14.1.0 or later |
| Token Action HUD Core | 2.1 or later |
| socketlib | Required by Token Action HUD Core. **Without it Core silently does nothing** — no HUD, no error message |
| Foundry VTT | 14 |

## Licence

MIT.
