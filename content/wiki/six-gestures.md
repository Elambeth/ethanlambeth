---
title: "Typing with six gestures"
summary: "How do we type efficiently in public with only six gestures?"
topics: [ar]
---

Mixed reality devices face a key problem: how do we type efficiently in public? This matters for both privacy and usability.

I want to interact with computers faster. I use Dvorak, vim shortcuts, and voice dictation. Brain-computer interfaces would be ideal, but most people don't want brain implants, and they are a few years away from being commonplace.

Meta's Orion glasses offer a middle ground. They use an EMG wristband that reads arm signals when you make hand gestures; no invasive technology needed.

Voice dictation is fast (three times faster than phone typing) but often inappropriate in public. I don't want to announce my messages in coffee shops or share private thoughts on buses. Carrying a keyboard defeats the purpose of lightweight mixed reality glasses.

Meta's wristband approach works because it's discreet and requires no extra equipment. But it has a major limitation. It only detects six hand gestures:

## Available Gestures
1. Thumb up
2. Thumb down
3. Thumb left
4. Thumb right
5. Thumb tap
6. Pinch

Six gestures severely limits text input. A standard keyboard has 80+ keys, and even smartphone keyboards have dozens of touch points. This raises the question: how can we type efficiently with so few options?

Here are methods to maximize efficiency with these limited inputs, considering speed, learnability, and practical daily use.

## Method 1: Linear Selection

```
A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q, R, S, T, U, V, W, X, Y, Z, SPACE, DELETE
```

**How it Would Work:**
- Move through letters with left/right thumb movements (2 actions)
- Select with thumb tap (1 action)
- Cancel with pinch (1 action)
Total actions used: 4/6

**Thoughts:**
- Pretty slow (assuming you are navigating 26 letters of the alphabet then you can assume an average of 13.5 movements per letter).
- But very easy to learn.
- Would get frustrating for longer texts as there is a high amount of wasted movement.
- You could make slight improvements by allowing the user to move from A-Z as a shortcut (Sort of like in Pacman how you can skip to the other side of the map).

## Method 2: 2D Grid Linear Selection
This is a slight improvement of the previous method by simply adding a second dimension.

```
A, B, C, D, E
F, G, H, I, J
K, L, M, N, O
P, Q, R, S, T
U, V, W, X, Y
Z, SPACE, DEL
```

**How it Would Work:**
- Move through letters with left/right/up/down thumb movements (4 actions)
- Select with thumb tap (1 action)
- Cancel with pinch (1 action)
Total actions used: 6/6

**Thoughts:**
- This would stand to benefit more from adding the 'Pacman Shortcut' as mentioned above as users will be able to skip from A down to Z, and from Z across to delete. Again reducing the amount of travel inputs.
- This would again be relatively easy to learn but can still be pretty slow.

## Method 3: 2D Grid with Axis Selection

This is the same 2D layout of letters as before, only now, instead of navigating a cursor around a grid you can select the X and Y axis of your desired input.
```
   [1][2][3][4][5]
[1] A, B, C, D, E
[2] F, G, H, I, J
[3] K, L, M, N, O
[4] P, Q, R, S, T
[5] U, V, W, X, Y
[6] Z, SPACE, DEL
```
**How it Would Work:**
- First gesture picks the column (y-axis).
- Second gesture picks the row (x-axis).
- Gives you access to 36 characters with just two inputs from any of the 6 gestures.
- For example if you wanted to select "L" you would give the input (2,3).
- The spare 6th gesture in the column would be to go back.

**Thoughts:**
- Always takes exactly 2 movements per character.
- Could be really fast once you memorize the grid.  However when dealing with hand gestures may seem less intuitive to users than moving your thumb in the direction of cursor movement.
- Might be available as an option for power users.

## Method 4: Triple Click (Like Old Phone Keyboards)
Remember texting on old Nokia phones? Similar concept but with thumb gestures instead of number keys.

```
Thumb up:    A, B, C
Thumb down:  D, E, F
Thumb left:  G, H, I
Thumb right: J, K, L
Thumb tap:   M, N, O
Pinch:       P, Q, R, S

Long Thumb up:    T, U, V
Long Thumb down:  W, X, Y, Z
Long Thumb left:  SPACE
Long Thumb right: DELETE
Long Thumb tap:   .?!
Long Pinch:       ,;:
```
**How it Would Work:**
- Single gesture for first letter.
- Double for second.
- Triple for third.
- Each gesture could access 3-4 characters.

**Thoughts:**
- What sets this apart is that it uses time as an axis for selecting.
- Surprisingly efficient for common letters.
- Very familiar concept for anyone who used old phones.
- Could be quite fast for common words.
- Timing might be tricky while walking.


## Method 5: Modal Layers

This is exactly like methods one and two but now it adds a third dimension, think of it as stacking lots of keyboards on top of one another. 
Like having different keyboards that you can switch between with a gesture.
```
Mode 1: Common Letters
A, B, C, D, E
F, G, H, I, J
K, L, M, N, O
P, Q, R, S, T
U, V, W, X, Y
Z, SPACE, DEL

Mode 2: Numbers & Symbols
1, 2, 3, 4, 5
6, 7, 8, 9, 0
!, @, #, $, %
^, &, *, (, )
-, +, =, [, ]
{, }, <, >, /

Mode 3: Common Words
THE, AND, FOR
BUT, YOU, THAT
WITH, HAVE, THIS
FROM, THEY, WILL
WHAT, BEEN, WHEN
THERE, THEIR, YOUR
```

**How it Would Work:**
- One gesture switches between modes (letters, numbers, symbols).
- Other gestures type characters in current mode, whether that is linear or Axis selection.
- Could have common words in one mode.

**Thoughts:**
- Great for mixing letters, numbers, and symbols.
- Can be pretty intuitive, and most people are familiar with the concept.
- Could be really fast once mastered.

## Future Possibilities
As EMG technology improves, we might see:
- More precise gesture detection (meaning you could have access to more gestures).
- Smaller, less noticeable wristbands.
- Possibly even adhesive-thin devices that can sit like a sticker on top of the skin.

See [[the-hand]] and [[input-devices]].
