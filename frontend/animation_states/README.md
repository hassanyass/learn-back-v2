# Animation States

This folder contains implementation-ready HTML state previews for the character animation system.

## Included States

- `confused_level_1.html`
  First confused pass. Softer expression and simpler acting.

- `confused_level_2.html`
  Stronger confused read with clearer mouth acting and external confusion symbols.

- `got_it_level_1.html`
  First "moment of understanding" pass.

- `got_it_level_2.html`
  Happier and clearer understanding state with improved smile and external idea symbols.

- `needs_more_information_level_1.html`
  "HMM" / "needs more information" state.
  Designed to feel inquisitive rather than confused.

## Naming Convention

Pattern:

`<state_name>_level_<n>.html`

Examples:

- `confused_level_1`
- `got_it_level_2`
- `needs_more_information_level_1`

This makes it easy to version emotional intensity without changing the state family name.

## UI Usage

These files are standalone HTML previews built on the same SVG rig structure.

Recommended UI integration options:

1. Use them as visual references for implementation.
2. Load them inside an `iframe` for quick internal tooling previews.
3. Extract the shared rig/state logic into your main avatar component later.

## State Calls Inside The Preview Files

Each preview exposes a global JavaScript API:

```js
window.setState("idle");
window.setState("confused");
window.setState("got_it");
window.setState("hmm");
```

Notes:

- Not every file is centered on every state, but the previews preserve the state system where applicable.
- `got_it` is a one-shot sequence and then returns to `idle`.
- `hmm` is the "needs more information" behavior.

## Example UI Wiring

If the preview is loaded in an iframe:

```js
const avatarFrame = document.getElementById("avatar-frame");
avatarFrame.contentWindow.setState("confused");
```

If you later move the logic into your app runtime:

```js
avatar.setState("confused");
avatar.setState("got_it");
avatar.setState("hmm");
```

## Suggested Product Mapping

- `confused`
  Use when the system is uncertain or does not understand.

- `got_it`
  Use when the system understands or completes clarification.

- `needs_more_information`
  Use when the system wants the user to provide more detail.

## Recommended Current Defaults

- Confused default:
  `confused_level_2.html`

- Got it default:
  `got_it_level_2.html`

- Needs more information default:
  `needs_more_information_level_1.html`

## File Paths

- [confused_level_1.html](C:/Users/hassa/Documents/Dummy%20AI%202/Character%20Devolpment/Animation/animation_states/confused_level_1.html)
- [confused_level_2.html](C:/Users/hassa/Documents/Dummy%20AI%202/Character%20Devolpment/Animation/animation_states/confused_level_2.html)
- [got_it_level_1.html](C:/Users/hassa/Documents/Dummy%20AI%202/Character%20Devolpment/Animation/animation_states/got_it_level_1.html)
- [got_it_level_2.html](C:/Users/hassa/Documents/Dummy%20AI%202/Character%20Devolpment/Animation/animation_states/got_it_level_2.html)
- [needs_more_information_level_1.html](C:/Users/hassa/Documents/Dummy%20AI%202/Character%20Devolpment/Animation/animation_states/needs_more_information_level_1.html)
