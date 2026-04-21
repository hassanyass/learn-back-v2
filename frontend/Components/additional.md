# Comprehensive Character SVG/JSX Rigging Plan

## 1. Overview and Engineering Goal
The objective is to accurately recreate the provided 2D character as a modular, animatable SVG embedded within a React JSX component. The recent turnaround references reveal crucial volumetric data (a pronounced belly, flat back, and specific strap routing) that must inform the 2D path construction. The target is a "3/4 Front" or "Direct Front" base pose that is grouped logically for skeletal/vector animation.

**Art Style:** Clean 2D vector, cel-shaded with soft shadows, uniform thick dark outlines (`4px`), and a bottom-heavy "pear/bean" aesthetic.

## 2. Global Constants & Palette
* **Base Canvas:** `viewBox="0 0 800 800"` (Center the character at `x: 400, y: 400`).
* **Stroke:** `strokeWidth="4"`, `strokeLinecap="round"`, `strokeLinejoin="round"`, `stroke="#2C1A27"`.
* **Color Palette:**
    * `outline`: `#2C1A27` (Very dark warm purple/black)
    * `skinBase`: `#9E7494` (Muted mauve)
    * `skinShadow`: `#855A7A` (Darker mauve for depth)
    * `shirtBase`: `#194A59` (Dark teal)
    * `overallBase`: `#89678A` (Plum)
    * `pocketGreen`: `#7FB38C` (Sage green)
    * `buttonGold`: `#E0BC56` (Warm gold)
    * `eyeWhite`: `#FFF9F4` (Off-white)
    * `groundShadow`: `#E0D8D8` (Warm light grey)

## 3. Z-Index Layering (Back to Front) & Structural Breakdown
Construct the SVG groups (`<g>`) in this precise order. 

### Layer 1: Environment
* `<ellipse id="ground-shadow">`: Flat, wide oval situated beneath the feet. Fill: `groundShadow`. No stroke.

### Layer 2: Back Elements (Visible in 3/4 or Side Views)
* `<g id="arm-back">`: (If drawing the 3/4 view) The rear arm hanging behind the body. 
* `<g id="leg-back">`: The rear leg. Short, thick cylinder. Flat, rounded foot with a slight toe bump.

### Layer 3: Main Body Base (The "Bean")
* **Volume Note:** The side profiles reveal the body is NOT perfectly symmetrical front-to-back. It has a flatter spine/back and a pronounced, rounded belly sloping down from the chest.
* **Shape (`<path id="body-base">`):** A bottom-heavy pear shape. Tapers gently to a rounded dome (head). 
* **Shading (`<path id="body-shadow">`):** A crescent-shaped shadow under the chin area and along the lower curve of the belly/hips to establish the 3D spherical volume. Fill: `skinShadow`.

### Layer 4: T-Shirt Base
* **Shape (`<path id="shirt-torso">`):** Wraps around the upper third of the body. 
* **Neckline:** A wide, shallow curve. In a 3/4 view, this curve wraps further around the back.
* **Back View Note:** The shirt cuts off in a straight horizontal line across the mid-back where the overalls meet it.

### Layer 5: Front Limbs (Arms & Legs)
* **`<g id="leg-front">`:** Short, stout. Placed in the foreground. Cuffs of the overalls will overlap the top of this.
* **`<g id="arm-front">`:** * **Sleeve (`<path id="sleeve-front">`):** Flared, bell-shaped cut, extending outward from the shoulder. Fill: `shirtBase`. Outline: `outline`. Include a sliver of dark shading inside the sleeve opening.
    * **Arm (`<path id="arm-skin-front">`):** Thick, tapered sausage shape. Merges into a mitten hand. 
    * **Fingers:** Add 2-3 small internal `<path>` curves at the bottom of the hand to define stubby fingers, plus a small thumb notch facing the body.

### Layer 6: Overalls (The Complex Layer)
* **Pants Base (`<path id="overall-pants">`):** A large bowl shape covering the lower half. The side profile shows this shape juts forward over the belly and drops straight down the back.
* **Front Bib (`<path id="overall-bib">`):** A rounded trapezoid. Slopes outward over the belly.
* **Back Panel (Reference Only):** If animating a turn, note that the back of the overalls is a straight horizontal line across the mid-back, much lower than the front bib.
* **Straps (`<path id="overall-straps">`):** Thick bands. They anchor at the top corners of the front bib and curve over the shoulders. 
* **Leg Cuffs (`<g id="cuffs">`):** Thick, rolled rectangular bands at the base of the pants. They must wrap around the cylinder of the leg (slight downward curve).

### Layer 7: Overall Details (Hardware & Pockets)
* **Buttons:** Two perfect circles (`#E0BC56`) where the straps meet the bib.
* **Chest Pocket (`<path id="pocket-chest">`):** U-shaped (flat top, curved bottom) centered on the bib. Fill: `pocketGreen`.
* **Side Pockets (`<path id="pocket-side-left">`, `<path id="pocket-side-right">`):** Asymmetrical curved wedges hugging the outer contours of the hips.
* **Rear Pocket (Data from Back View):** A single, wide U-shaped `pocketGreen` patch centered on the rear. (Include if rendering 3/4 back view).
* **Seam Lines:** Add thin `<path>` lines (Stroke: `outline`, Width: `2px`) for the fly stitch, pocket hems, and cuff vertical stitches.

### Layer 8: Facial Rig
* **Positioning:** The side profile shows the face sits on a slight localized bump (a subtle snout/muzzle area). Place features slightly lower on the head dome than absolute center.
* **`<g id="face-rig">`:** Group all facial features here for easy translation (parallax effect for head turns).
* **Eyebrows:** Two thick, floating, rounded rectangles. Slightly asymmetric (one raised higher for expression). Fill: `outline`.
* **Eyes:**
    * Sclera: Two tall ovals. The left oval should be slightly narrower in a 3/4 view due to perspective. Fill: `eyeWhite`.
    * Pupils: Dark circles resting at the bottom-inner edges of the sclera.
    * Highlights: Tiny white dots in the top-right of the pupils.
* **Mouth:** A delicate `<path>` curve. In 3/4 view, the mouth curves up into the cheek, with a tiny secondary line indicating a cheek crease or dimple.

## 4. Animation Directives for JSX implementation
When generating the React component:
1.  **Group logically:** Ensure `<g>` tags map exactly to the IDs listed above.
2.  **Transform Origins:** Inject inline styles (e.g., `style={{ transformOrigin: 'center 20%' }}`) into the arm and leg groups to define the rotation joints at the shoulders and hips.
3.  **Scale/ViewBox:** Ensure the SVG uses `viewBox="0 0 800 800"` and `width="100%"` `height="100%"` so the character scales fluidly within its parent container.