---
title: "Maybe it's just HTML"
summary: "Render everything as HTML, fast TPS presets for similar patterns."
topics: [interfaces]
---

Maybe it's just HTML.

Render everything as HTML, fast TPS presets for similar patterns.

Every element can be highlighted, selected, asked about, or linked to another page or site. Like an infinite wiki...
- Need vim bindings? Or an easy way to select parts of the response and ask?
- Or just really good branching and display?
- Does this need to be a browser? What things do I need?
    - Different "pages" or files that are shown. Do I treat everything as files?
    - Good branching or nav between them, forward and back and globally.
    - Intelligence I can point at different things, or feed different things into.
    - That intelligence then gives me output (in the form of text and HTML just how I like it).

So these things don't actually need to be a browser... it could just be something terminal ish, all it needs to do is render HTML and allow me to have Claude Code or something run through it.

## HTML better than markdown

HTML better than markdown because it can:
- expose a surface to you when you need it
- markdown is entirely linear
- fast enough HTML can generate components that are relevant to explaining a point
- they can fetch images from a URL and display them in whatever interface style you prefer (eg carousel, etc)
- you should be able to type notes, AI queries, search queries, everything to this one surface.
- so is it one text box? (therefore avoid selection of text and popup boxes, keep the same box but that chunk just gets added as context)
- there might be repeated components saved that the model doesn't have to generate every time? HTML blocks it stashes, themes you like etc.
- however maybe the video system is one that doesn't have things separated into this arbitrary structure. (This would update me more towards thinking diffusion is the freer interface, but for now I think so much of what we have already as infrastructure and what these models are good at, HTML makes sense.)

So tldr the main point is everything as HTML, it's a [[hyperobject]] dynamic, polymorphic, the system exposes to you the soft fleshy parts that you can interact with, it gently raises it up towards you (like that one table made up of the little columns that can hand you things etc).

So practically we just need something that renders HTML, has my notes, and can have intelligence directed through it, and also web search I suppose (reading webpages, maybe rendering them). But I suppose the ideal system picks them apart anyway, like my [[reading|how do I like to read things]] extension. It should take in images, other links, maybe preload those into context to understand the relationship (the scale should not be at that of single webpages rerendered, it should be a level above, at the topic overview level).

## Precompute the interface

I thought a lot about generative interfaces and how many TPS you need to be able to do it well, but why not just precompute the interface, I am probably on the same N sites most of the time anyway...

## HTML or diffusion

So what makes the most sense for models generating GUI? The options feel like:

- Generating structured HTML:
    - generate multiple answers for the user to select (sort of like what Claude Code does).
    - can "save" repeated structures.
    - feels more rule based.
- Generative UI / diffusion models:
    - do I just understand this slightly less?
    - seems to be further away.
    - don't conflate being further away as bad in our imaginary scenario where we are idealizing the perfect system!
    - more fluid than HTML?

See [[induced-fit]].

## Mini apps

How long until the ChatGPT app has custom "mini apps" within that you prompt into existence and they are a repeatable interface/surface for you.

Kind of like iOS shortcuts etc.

Most people won't play around / explore with them much but if it happens autonomously I see it being huge and a way to really eat into the Apple interface.

Eg, notifications prompting the user to decide on something. Help them with repetitive decisions.

The jump to companion / assistant is likely very soon.

> "What are you having for dinner today? Want help deciding?"

> nrn

> alg, want me to ask again later?

> yup

I guess the interface for most people is mobile. And the surface is not usually text.

I see there being either some conflict or cooperation between Apple and OpenAI around this surface. Apple have distribution and design taste, and ecosystem but OpenAI has arguably just as good design taste, less of an ecosystem but far more intelligence. The two companies also have differing incentives. One wants to sell you repeated intelligence, the other mainly wants to sell you the next hardware. Persistent software updates are something Apple would avoid if they could.

See [[homescreen]].

## Text

I guess the thing about interfaces is that they are mostly text, the code stuff, and images. That is ALL we have.

Maybe text is just the way things should be? Trying to abstract meaning into symbols is difficult, lossy and a waste. Given enough words I can capture 99.9% of anything I mean to say. So I should lean hard into zettelkasten, more notes, more examples, more links, more relationships. But then are the notes themselves becoming the symbols and relationships I was describing?
