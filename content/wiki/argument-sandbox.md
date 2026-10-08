---
title: "Growing an argument"
summary: "Adding absurd constraints is a way to force you to get creative."
topics: [interfaces]
---

Adding absurd constraints is a way to force you to get creative.

In the v1 I tried to avoid using text input to try and 'grow' an essay.

This was interesting and forced me to think about what are the commands you would need to build out a basic argument. And then how to display/give them to the user.

## Can you grow an argument without typing?

- Is there a way to write without typing anything?
    - Can you be provided with just lists of "directions" and direct its growth in real time? Like a sci-fi spacecraft landing interface?
    - Grow each point out?
    - Inputs you will need are:
        - expand / grow a point
        - delete a point
        - navigate around different points?
    - (Be careful that you don't end up first principling a keyboard/making too many input buttons.)
- Can you negate a point? Rotate an argument's shape just with some *directional* inputs and no words.

I should have a claim "splitter" where sometimes the model will squeeze in two claims at once, and we need to surgically spread them out. (This can also be run on the user's initial input!)

Maybe it should be a text based tool. Not a canvas or graph, we can prob visually space things out fine with simple collapsing toggles downwards for examples. Nav left/right for why/then. And then show a little icon in the margin if the point is negated, then have a keybind to "toggle/flip". This feels like a very compact/compressed view.

See [[thinking-assistant]].

## Leakiness

I was about to ask Claude how leaky an essay was. And I realized this would be a great use case for what we have here. Can we have a tangible score of leakiness? Is this just argument validity? A score of how well established points, examples and flip sides are.

Are there potentially things I am missing/not considering (suppose these are flipsides to points!, maybe another shape too? Holy shit dude I am thinking of this in shapes, I want a tool to help me see the shapes!)

## Where do the suggestions live?

Because having more text, that tells you why the other text is bad, and what text needs fixing feels wrong...

How do I have LLM suggestions and where do they live? Not a sidebar. They are the nodes but are not in a box yet... they can be crystallized by "accepting" them which makes them solid.

For showing a skeleton/overview a side panel is an option yes, but so is a toggle-able layer. Or a slider! There are many options rather than just a sidebar.

Can you represent an argument without ANY words?

## Space or organizing?

I wonder if just visually putting things in 2D is enough (or actually any) value! Like you can pan around, but I think a lot of value comes from the organizing aspect.

We made the interfaces demo where you move around and grow it section by section, this is still archaic. The ideal system is one where the structure is sorted for you automatically and you get help / support. I.e. the system also understands the structure not just the nodes.

I should be able to search semantically across all of my notes and find the idea. The issue is that my notes are the bricks and structure of my ideas which gets in the way, I want the actual shape of the ideas to be the structure not arbitrary files.

I am trying the atlas demo right now, and the structure is great, but I guess the drawback of rigid structure is that it doesn't feel free to add more notes, there is friction on where to add it. As with all interfaces, there is either rigid organized structure of what already exists. Or there is freedom and inherently chaos, which has friction in discoverability.

This problem is oh so frustrating but I think it is because it is new. It brings to our attention just how frustrating the current system is. We just don't notice because we are used to it.

## One text box

Ok maybe I just want one text box to type into that directs agents/intelligence. The interface I maybe want to have one surface and it be sorted for me?

Maybe what I am looking for isn't so much a set list of commands but the ability to run "meta commands" over my ideas, a body of text etc. I think I am yearning to be able to interact with the ideas and play/sort them more granularly.

Can you attach "bundles" of context to LLMs, or a council of LLMs, a folder or collection of files, point them at different things? And what is the interface for this! We should be bunching up notes, like scooping up cranberries from water with our hands. Then attaching a note to it and sending it away to the model? (Counter question is "how much will we actually need to attach files ourselves? Rather than have the agent just look for itself".)

I guess not all ideas have to be a big giant sprawling hyperobject. Maybe I want to just build from the ground up as a way for me to wrap my head around things.

See [[one-surface]].
