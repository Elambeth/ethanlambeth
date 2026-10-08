---
title: "A thinking assistant"
summary: "There are AI assistants to help you write code, but none to help you think."
topics: [interfaces]
---

> Lord Henry played with the idea and grew wilful; tossed it into the air and transformed it; let it escape and recaptured it; made it iridescent with fancy, and winged it with paradox. The praise of folly, as he went on, soared into a philosophy, and philosophy herself became young.
>
> (Oscar Wilde, The Picture of Dorian Gray)

The chat interface sucks. Linear text is a tragic constraint we have suffered through long enough. There are AI assistants to help you write code, but none to help you think. Coding agents are great. They arguably have given 10x or 100x productivity improvements to a lot of developers. But no similar system exists for thinking. When trying to mull over an idea with an LLM, often you will be bombarded with an onslaught of slightly relevant lukewarm arguments. Which personally is quite frustrating.

## Why do coding agents work?

Code is bounded, and verifiable. You can point at a bug, which will often exist within a narrow set of functions or files, and your helpful assistant will merrily direct itself there and apply fixes.
At first these tools needed steering, but that is becoming less and less of the case. Now they can poke around themselves, run commands and grep for whatever they need.
This is why they are great at code and bad at ideas. They can navigate code space expertly but flounder around ideaspace.

So that, I think, is where the core problem hides. Most of the time "idea-space" is broadly undefined. Most people have no clear structure to their thinking and neither do the models. The good news is I think it's entirely doable to try and get these models to break down arguments into a clean structure. That structure can be applied in two directions (you can label it while you're building the argument, or label one that already exists). And this is where I think the benefits hide!

## Mapping arguments

A good argument will have premises, points, sub-arguments, and a conclusion. And most of the time they are unlabelled. This is not difficult and can be done by a mix of satellite agents.

Once you have a clean structure, I think there can be these great benefits to help you think:

- Bug detection, similar to how a coding agent can point out syntax errors, I think the same can be done in your writing once you have a clean structure. For example, if simple premises are detected, you can have a web search agent go off and fact check its truth. Then you can have a "validity-checker" to assess whether your premises flow cleanly from one to the other, and tell you when large jumps are made. The hacky way I am picturing this being done is with some kind of "harness" with a collection of commands at its disposal. And a great suite of commands that I think will be useful will be a collection of "mental models" as checks to run over your reasoning. Some fun ones I think would be:
	- Negation: For every claim that you make, flip it and see if it holds. For example, if I make the claim "A back and forth chat interface with LLMs is bad for idea discovery", we could flip it and say "A chat interface is good for discovery" and see if it sort of holds. If it does then your claim is likely weaker than you think.
	- First principles descent: A small tool that will repeatedly ask "What caused this?" until you hit a canonical point, or an assumption that you can't defend. e.g. "I'm always late" → why → "I underestimate travel time" → why → "I never account for parking".
	- Detecting dead ends: A lot of writing involves writing 10x more than your final draft, so some system to tell you when you are waffling around something unnecessary could be very useful. This would require the system having some kind of understanding of your broad goal of the piece and then detecting when you deviate. For example, if you are writing a recipe online and write a 500 word life story before getting to the recipe.
	- There are a bunch more mental models that I love to use that I think would be very useful to be automatically detected / applied for me, because it takes a deliberate pass over my thinking to apply them and I often don't! So having some suite of epistemological rules, or razors, would be incredibly useful!

See [[argument-sandbox]].

## Pruning

I think the hardest problem you would run into trying to make a system like this would be pruning / shaping your overall argument. I love bonsai, and something you do with your trees is to cut unnecessary branches so that the "good ones" can get more light, and the overall tree can have circulation. And I think the same would apply here. Writing and thinking feels a lot like stumbling around a dark maze, so I think the highest value help is being told early when you are going down a dead end, and what branches to cut. This requires a rich understanding of the ideaspace at hand, and also the reader's goals and values. This is what Gwern's "[[guardian-angels|Guardian Angels]]" describes incredibly well, and is definitely the ideal system to push towards. I am unsure how achievable this is with the current model paradigms (he has good arguments on why not). But I think there is still value we can squeeze out until then.

None of this is the guardian angel Gwern describes. It feels a lot closer to autocomplete for your reasoning. I think we have a window of a few years until we get BCIs and your preferences can get fully modelled and adhered to. But until then, I think we should at least try to use the current tools as best we can.

See [[reading]].
