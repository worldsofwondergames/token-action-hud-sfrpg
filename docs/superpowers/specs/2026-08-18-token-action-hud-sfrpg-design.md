# Token Action HUD Starfinder — Design

Date: 2026-08-18
Status: Approved, not yet implemented

## Purpose

A Token Action HUD Core system module for the Starfinder (`sfrpg`) Foundry VTT
system. Token Action HUD puts a repositionable HUD of actions beside the selected
token; Core supplies the HUD and this module tells it what a Starfinder actor can
do.

Modelled on [token-action-hud-megs](https://github.com/worldsofwondergames/token-action-hud-megs),
which follows the same Core 2.1 contract.

## Scope

First version covers two of the system's seven actor types:

- `character`
- `mech`

`npc2`, `drone`, `starship`, `vehicle` and `hazard` are out of scope. They build
an empty HUD rather than an error, and each is a candidate for a later version.
`npc2` and `drone` are the cheapest follow-ups because they share the character
skills/saves/abilities shape; `starship` and `vehicle` are not, because crew
roles are a different action model.

## Guiding rule

Every action calls an existing `sfrpg` entry point. Nothing in this module
reimplements a roll. A HUD roll must therefore behave identically to the same
roll from the sheet — same roll dialog, same modifiers, same chat card.

Where no entry point exists, the fix is to add one to the system (see
"System-side change" below), not to duplicate the system's logic here.

The dependency runs one way. This module reads from `game.sfrpg` and
`CONFIG.SFRPG`; the `sfrpg` system contains no reference to Token Action HUD.

## Architecture

Same file layout as the MEGS module.

```
module.json
scripts/
  init.js             publishes SystemManager to Core
  constants.js        MODULE / SYSTEM ids, ACTION_TYPE, GROUP definitions
  defaults.js         DEFAULTS: tab layout + group list
  system-manager.js   getActionHandler / getRollHandler / registerDefaults / registerSettings
  action-handler.js   buildSystemActions(): reads the actor, emits groups and actions
  roll-handler.js     handleActionClick(): dispatches into sfrpg entry points
  settings.js         client-scoped display settings
languages/en.json
styles/token-action-hud-sfrpg.css
e2e/                  Playwright suite against a live Foundry world
```

Registration is Core's two-hook sequence. `init.js` waits on
`tokenActionHudCoreApiReady`, sets `module.api = { requiredCoreModuleVersion,
SystemManager }`, then calls `tokenActionHudSystemReady`. Every class in this
module is defined inside a `tokenActionHudCoreApiReady` handler, so with Core
absent no class is even declared and the module is inert rather than broken.

`REQUIRED_CORE_MODULE_VERSION` is `'2.1'` — pinned to the minor, not the major.
Core 2.1 removed the `encodedValue` action format and a further minor could move
the contract again; pinning to the minor makes that break loud.

### Compatibility

| | |
|---|---|
| `sfrpg` system | 14.1.0 minimum |
| `token-action-hud-core` | 2.1 minimum |
| `socketlib` | Required by Core. Without it Core silently does nothing |
| Foundry VTT | 14 |

## Character layout

| Tab | Group(s) | Source | Entry point |
|-----|----------|--------|-------------|
| Abilities | Abilities | `system.abilities`, keys from `CONFIG.SFRPG.abilities` | `actor.rollAbility(id)` |
| Saves | Saves | `system.attributes.{fort,reflex,will}`, keys from `CONFIG.SFRPG.saves` | `actor.rollSave(id)` |
| Skills | Skills | `system.skills` | `actor.rollSkill(id)` |
| Attack | Weapons | `weapon` items | `item.rollAttack()` and `item.rollDamage()` |
| Inventory | Consumables, Equipment, Other | `consumable`, `equipment`, `technological`, `hybrid`, `magic`, `shield`, `goods`, `container` items | `item.useItem()`, or `item.rollFormula()` where there is no usage |
| Spells | one group per level, 0–6 | `spell` items grouped by `system.level` | `actor.useSpell(item)` |
| Feats | Feats | `feat` items | `item.roll()` |
| Utility | Utility | — | initiative, end turn, short rest, long rest |

Details that follow from the system's own data rather than from choices made here:

- **Skills.** Profession skills are separate entries keyed `pro`, `pro1`, `pro2`…
  and carry a `subname`. The action name uses `subname` where present so two
  professions are distinguishable. `rollSkill()` already raises the trained-only
  confirmation dialog for player-owned actors, so the HUD must call it rather
  than `rollSkillCheck()`.
- **Weapons.** Attack and damage are two separate actions rather than one action
  that does both, matching the two buttons on the sheet. `item.hasAttack` and
  `item.hasDamage` decide which of the two exist for a given weapon.
- **Spells.** `actor.useSpell(item)` raises the spell-slot dialog, which is where
  slot availability is decided. The HUD does not pre-judge it: a spell with no
  slots left at its own level is still listed, because the system permits casting
  from a higher slot. The action name carries the remaining slot count for the
  level so the state is visible without clicking.

### Settings

Client-scoped so each player controls their own HUD density.

- **Show untrained skills** — default off. Starfinder characters carry all skills
  whether or not they have ranks; showing every one makes the Skills tab unusable.
- **Show unequipped items** — default off. Matches the sheet's inventory filter.

Both call Core's `onChangeFunction` to rebuild the HUD.

## Mech layout

| Tab | Group(s) | Source | Entry point |
|-----|----------|--------|-------------|
| Weapons | Weapons | `mechWeapon` items | `item.rollAttack()` / `item.rollDamage()` |
| Systems | Auxiliary, Mission Pods, Upgrades, Frame | `mechAuxiliary`, `mechMissionPod`, `mechUpgrade`, `mechPowerCore`, `mechUpperLimb`, `mechLowerLimb` items | see below |
| Actions | Power Point, Special, Gear | hardcoded lists + `item.system.actions[]` | `actor.useMechAction(...)`, new — see below |
| Utility | Utility | — | initiative, end turn, cancel armed damage override |

- **Weapons** need no new plumbing. `ItemSFRPG.rollAttack()` already routes
  `mechWeapon` to `_rollMechAttack()` and `rollDamage()` to `_rollMechDamage()`.
- **Mission pods** are activated and deactivated rather than rolled; the action
  toggles, and its label reflects current state.
- **Gear actions** come from `item.system.actions[]` on mech gear items and are
  reachable from a module already.
- **Power Point and Special actions** are not reachable. See below.

## System-side change (`sfrpg`)

The mech Power Point actions (Aim, Devastating Hit, Maneuver, Replenish, Resist)
and Special actions (Called Shot, Hurl, Scan) are hardcoded arrays inside
`ActorSheetSFRPGMech._onMechAction()` at `src/module/actor/sheet/mech.js:492`,
addressed by array index from a `data-action-index` attribute. A module cannot
reach them.

`_onMechAction()` also does the work that follows choosing an action: checks the
mech has enough PP, warns and aborts if not, deducts the cost, arms the
`sfrpg.damageLevelOverride` flag for Devastating Hit, and renders the
`mech-action-card.hbs` chat card. Duplicating the arrays in this module would
mean duplicating all of that too, and the two copies would drift.

`_onCancelOverride()` at `src/module/actor/sheet/mech.js:592` has the same problem
for the same reason: it unsets the `sfrpg.damageLevelOverride` flag and refunds
the PP that armed it, and a module has no way in.

**The change:** move the bodies of both handlers onto the mech actor as
`ActorSFRPG#useMechAction(category, index, { itemId, itemActionIndex })` and
`ActorSFRPG#cancelMechDamageOverride()`, with the two action tables published on
`CONFIG.SFRPG` as `mechPPActions` and `mechSpecialActions`. Each sheet handler
becomes a thin call into its actor method. No behaviour changes; the sheet does
what it did before and the module gets entry points that produce identical
results.

This mirrors megs#156, where the MEGS system had to expose its roll classes on
`game.megs` before its HUD module could reuse them.

This work is filed against `foundryvtt-starfinder`, not against this repo, and
must be released before phase 3 here.

## Roll dispatch

`RollHandler.handleActionClick(event)` reads `this.action.system.{actionType,
actionId}` — Core 2.1 supplies the action and the resolved `this.actor` /
`this.token`; there is no `encodedValue` argument.

With no single actor resolved (nothing selected, or several tokens), the handler
iterates `Utils.getControlledTokens()` and runs the action for each. Actions that
make no sense for a multi-selection are not built in the first place.

Unknown action types log a warning and do nothing rather than throwing, so one
bad action cannot take the HUD down.

## Testing

Playwright driving a real Foundry world, using the MEGS suite's fixture shape
(`global-setup.mjs` logs in and enables the module, `tah.mjs` reads the rendered
HUD, `test-data.mjs` builds actors). The MEGS module found every one of its bugs
in the interaction between Core, Foundry and the game system rather than in
isolated logic, so unit tests over mocked Core would not have caught them.

A run requires Foundry at `localhost:30000` with an `sfrpg` test world, nobody
logged in (Foundry allows one Gamemaster session), and a Foundry restart since
the module was added — it only scans `Data/modules` at server startup.

Coverage per phase:

- Character: each tab builds; an ability roll, a save, a skill, a weapon attack,
  a weapon damage roll, and a spell cast each produce the expected chat card.
- Settings: toggling "show untrained skills" changes which skills the Skills tab
  contains, read against the actor's live skill data rather than a fixed list.
- Mech: weapon attack and damage; a PP action deducts the right PP and refuses
  when PP is short; Devastating Hit arms the damage-level override and the next
  damage roll consumes it.
- Utility: end turn is offered only to the combatant whose turn it is.

Every test must be shown to fail before it is trusted: mutate one thing per test,
confirm it fails for the right reason, revert.

## Phases

| Phase | Work | Depends on |
|-------|------|------------|
| 0 | Scaffold: `module.json`, constants, defaults, system manager, empty handlers. Module registers with Core and shows empty tabs | — |
| 1 | Character tabs and roll dispatch | 0 |
| 2 | `sfrpg`: extract `_onMechAction()` and `_onCancelOverride()` onto `ActorSFRPG`, publish the action tables on `CONFIG.SFRPG` | — |
| 3 | Mech tabs and roll dispatch | 0, 2 |
| 4 | Playwright suite | 1, 3 |

Phase 2 is in the `foundryvtt-starfinder` repo. Phases 0, 1, 3 and 4 are here.

## Prior art and naming

`nzlbob/token-action-hud-sfrpg` exists on GitHub: a stub, last pushed
2026-06-11, with an empty stylesheet, an empty `lang/` directory, an 814-byte
script, and no licence. It is not a working module, but it claims the obvious
repo name and declares module id `token-action-hud-sfrpg`. Check the Foundry
package registry for that id before the first release; if it is taken, this
module ships as `token-action-hud-starfinder`.

Token Action HUD Classic carried built-in `sfrpg` support and is worth reading
for how it grouped Starfinder actions, though it predates the Core 2.x contract
entirely and none of its code transfers.

## Out of scope

- Actor types other than `character` and `mech`.
- Starship crew role actions.
- Any change to how `sfrpg` rolls anything. Phase 2 moves code; it does not
  change behaviour.
