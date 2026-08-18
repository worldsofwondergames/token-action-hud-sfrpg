# Token Action HUD Starfinder

Token Action HUD system module for the [Starfinder](https://github.com/worldsofwondergames/foundryvtt-starfinder) (`sfrpg`) system for Foundry VTT.

Token Action HUD puts a repositionable HUD of actions next to the selected token. This module tells it what a Starfinder actor can do.

## Status

Implemented for the `character` and `mech` actor types. The other five — `npc2`, `drone`, `starship`, `vehicle`, `hazard` — build an empty HUD and are candidates for a later version.

The design is in [`docs/superpowers/specs/2026-08-18-token-action-hud-sfrpg-design.md`](docs/superpowers/specs/2026-08-18-token-action-hud-sfrpg-design.md), and the work is tracked in [issue #1](https://github.com/worldsofwondergames/token-action-hud-sfrpg/issues/1).

The mech Actions tab needs the `sfrpg` changes that put `useMechAction()`, `cancelMechDamageOverride()` and `setMissionPodActive()` on the actor. Those are part of the Starfinder system, not of this module, and this module's mech tabs do nothing without them.

## Installation

Install Token Action HUD Core and socketlib first, then add this module's manifest:

```
https://raw.githubusercontent.com/worldsofwondergames/token-action-hud-sfrpg/main/module.json
```

socketlib is not optional. Core gates its own registration on socketlib being active, so without it there is no HUD and no error message either.

## Layout

**Character**

| Tab | Contents |
|---|---|
| Abilities | The six ability checks |
| Saves | Fortitude, Reflex, Will |
| Skills | Trained skills; every skill with the setting on |
| Attack | Each equipped weapon's attack, and each one's damage |
| Inventory | Consumables, equipment, other carried items |
| Spells | One group per level, showing the slots left for that level |
| Feats | Feats, posted to chat as the system's item card |
| Utility | Initiative, end turn, short rest, long rest |

**Mech**

| Tab | Contents |
|---|---|
| Weapons | Each mounted weapon's attack, and each one's damage |
| Systems | Auxiliary systems, mission pods, upgrades, chassis components |
| Actions | Power Point actions, special actions, gear actions |
| Utility | Initiative, end turn, cancel an armed damage override |

## Settings

Both are client-scoped, so each player controls their own HUD.

- **Show untrained skills** — off by default. A Starfinder character carries all twenty skills whether or not they are trained.
- **Show unequipped items** — off by default. Applies only to items that can be equipped; consumables and trade goods are always shown.

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

## Tests

Playwright, driving a real Foundry world rather than a mocked Core:

```
npm install
npm run test:e2e
```

A run needs Foundry serving on `localhost:30000` with a world called **Starfinder Test World** running the `sfrpg` system, nobody logged in (Foundry allows one Gamemaster session), and a Foundry restart since this module was added — it only scans `Data/modules` at server startup.

## Licence

MIT.
