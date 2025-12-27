# Game Feel Improvements - Test Plan

## Overview
This document outlines manual testing procedures for the improved game feel features:
- Smooth lane switching with interpolation
- Input buffering
- Grace window for collisions (coyote-time)
- Near-miss detection with bonus points

## Test Environment Setup
1. Open the game in a browser (Chrome/Firefox recommended)
2. Ensure sound is enabled for audio feedback tests
3. Test on both desktop (keyboard) and mobile (touch) if possible

---

## Test 1: Keyboard Controls - Smooth Lane Switching

**Objective:** Verify smooth, interpolated lane switching with keyboard controls

**Steps:**
1. Start a new game
2. Use Left/Right arrow keys to switch lanes
3. Observe the player movement

**Expected Results:**
- Player should smoothly slide between lanes (not instant snap)
- Movement should feel responsive and fluid
- Switching should complete in approximately 180ms (SWITCH_TIME_MS)
- Player should align to lane centers

**Pass Criteria:**
- ✅ Smooth interpolation visible (no instant jumps)
- ✅ Movement feels responsive
- ✅ Player stops at correct lane positions

---

## Test 2: Touch Controls - Input Buffering

**Objective:** Verify input buffering works during lane switches

**Steps:**
1. Start a new game on mobile or with touch controls
2. Tap left half of screen to start a left lane switch
3. While the switch is in progress, tap right half of screen
4. Observe the behavior

**Expected Results:**
- First switch should complete smoothly
- Second switch should queue and execute immediately after first completes
- No input should be lost
- Player should smoothly transition through both switches

**Pass Criteria:**
- ✅ Input during switch is queued
- ✅ Queued switch executes after current switch completes
- ✅ No lag or missed inputs

---

## Test 3: Tilt Controls - Original Behavior Preserved

**Objective:** Verify tilt controls still work and don't use lane switching

**Steps:**
1. Enable tilt controls in Settings
2. Start a new game
3. Tilt device left/right

**Expected Results:**
- Player should move smoothly based on tilt
- No lane snapping should occur
- Movement should be continuous (not discrete lanes)
- Original tilt behavior preserved

**Pass Criteria:**
- ✅ Tilt controls work as before
- ✅ No lane switching behavior with tilt
- ✅ Smooth continuous movement

---

## Test 4: Pause Functionality - State Preservation

**Objective:** Verify pause works correctly with new movement system

**Steps:**
1. Start a new game
2. Press arrow key to start a lane switch
3. Immediately press P to pause
4. Press P again to resume

**Expected Results:**
- Game should pause immediately
- Lane switch should resume from where it paused
- No visual glitches or position jumps
- All game state preserved

**Pass Criteria:**
- ✅ Pause works during lane switch
- ✅ Resume continues smoothly
- ✅ No state corruption

---

## Test 5: Reduced Motion - Visual Effects Disabled

**Objective:** Verify reduced motion setting disables camera shake and flash

**Steps:**
1. Enable "Reduced Motion" in Settings
2. Start a new game
3. Intentionally collide with a bollard
4. Observe visual effects

**Expected Results:**
- No screen shake on collision
- Particles may be reduced or disabled
- Near-miss particles should be disabled
- Game should still be playable

**Pass Criteria:**
- ✅ No screen shake when reduced motion enabled
- ✅ Visual effects appropriately reduced
- ✅ Game remains functional

---

## Test 6: Near-Miss Detection (Bonus)

**Objective:** Verify near-miss detection awards bonus points

**Steps:**
1. Start a new game
2. Maneuver player to pass very close to a bollard (within 30 pixels)
3. Observe feedback

**Expected Results:**
- "NEAR MISS! +X" pop-up appears
- Bonus points added to score
- Sound effect plays (if sound enabled)
- Green particles appear (if reduced motion disabled)
- Haptic feedback (if enabled on mobile)

**Pass Criteria:**
- ✅ Near-miss detected when passing close
- ✅ Bonus points awarded
- ✅ Visual/audio feedback present
- ✅ Only triggers once per bollard

---

## Test 7: Grace Window (Coyote-Time)

**Objective:** Verify grace window allows escape from collisions

**Steps:**
1. Start a new game
2. Position player so collision is imminent
3. Quickly switch lanes while bollard is very close
4. Observe if collision is avoided

**Expected Results:**
- If switching during close approach, collision may be avoided
- Grace window should be approximately 100ms (GRACE_MS)
- Player should feel like they have a fair chance to escape
- Game should feel more forgiving

**Pass Criteria:**
- ✅ Grace window provides escape opportunity
- ✅ Feels fair, not too easy
- ✅ Works during active lane switches

---

## Tuning Constants Reference

Located at top of `game.js`:
- `SWITCH_TIME_MS = 180` - Lane switch duration (milliseconds)
- `NEAR_MISS_DIST = 30` - Distance for near-miss trigger (pixels)
- `GRACE_MS = 100` - Collision grace window (milliseconds)

Adjust these values if gameplay feels too fast/slow or too easy/hard.

---

## Notes

- All tests should be performed with game running at normal speed
- If issues are found, check browser console for errors
- Test on multiple devices/browsers if possible
- Reduced motion should be tested separately from normal motion


