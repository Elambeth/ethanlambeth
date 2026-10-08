---
title: "Reading"
summary: "Most books feel too slow."
topics: [interfaces]
---

> And oftentimes, to win us to our harm, / The instruments of darkness tell us truths, / Win us with honest trifles, to betray's / In deepest consequence.
>
> (Banquo, Macbeth, Act 1, Scene 3)

Writing is one direction, building out an argument. But the same labelled structure can run the other way too! You can apply it to something you didn't write, and instead something you are reading. I think trying to ingest information can be improved by developing out the same structure, instead of having to unpack everything alone, at whatever pace the author decided for you.

My roommate is reading War and Peace at the moment and it reminded me of my stab at reading The Brothers Karamazov. After suffering through the first 200 pages, I eventually abandoned the endeavour mainly because: the names all read the same to me, which was incredibly confusing and hard to keep track of, and I got frustrated by slow sectioning. Which is a pain point I have had for a while, where most books feel too slow. It is the incentive of the author to be clear and ensure that the reader is able to follow along without making jumps too large, but I find this often leads them to rehash a lot of points. And for most of history this just wasn't a solvable problem. Now I think there are fun things you can do! For example, I think an ideal system that helps you read information is one that has adaptive detail. You should be able to zoom in and out of arguments similar to how you would in Google Maps, and the text should either be expanded on or distilled! (This is a demo I want to make ASAP.)

I also believe there exists a "perfect sentence" that will make a person grok any concept. I believe this perfect sentence varies person to person. Your goal should be trying to understand what does this for you. (I think personally I am the type of person that will immediately try to connect a concept to another analogy, usually something visual. I know the whole "visual learner" thing got debunked, but I have caught myself doing this practice a lot and it seems to work so far.) So the perfect thinking assistant we are describing here would not only help you expand out your own idea but also optimally digest the ideas of others.

I do have a concern with designing a "reading system" where you run the risk of creating an echo chamber and making it more difficult for new ideas or words to reach you! Forever coddled by your machine translator who caps your reading level at exactly where it is forever. So I do think the ideal system here has some kind of desire to "push your frontier", similar to when learning a new language, where there is an optimal spacing of adding new words to your practice.

See [[thinking-assistant]].

## Why does pasting it into Claude feel better?

When I paste a blog to Claude why does that feel better than reading it?

- It's more interactive? I can have some kind of grounding in the piece, if I just start reading the writing I have no grounding no footing, it could take me anywhere. When I paste it into an LLM I will often attach a question like "is this about X?" That way off the rip I have some kind of footing and understanding.
- Lower friction than forcing my mind into the shape the author demands through their writing? (Is this a bad habit? Or is it needed to protect my cogsec given how many bad writers there are? Do I need to know they are clean before I can read their raw thoughts, we need a real connection first.)
- It sometimes really is the friction of starting, does having a progress bar make me more motivated?
- Is it simply because it is one giant linear chunk. And what I yearn for is smaller chunks...
- I also catch myself sometimes getting bored at a very wordy paragraph and that is often when I stop/stray. Having a way to condense/reroll the writing in that paragraph could be good to keep me engaged, or simply just refining it to keep me in the flow.

Pros:
- Lower friction to reading + absorbing new information.
- Better synthesize with your existing knowledge.
- Good meta practice for reflecting on how you think.
- Cut out noise, I think the most common usage pattern where I read a blog via Claude is to give me the exec sum tldr highest level nugget of information.

## The shape

I think the ideal shape is just a reader, we paste text. And that's it. No rewording yet. As you read, you have automatic highlighting sort of like "Twilight", this could be semantic or just simply sentences. Then, there should be some incredibly simple interface for me to just type a note, and it gets assigned/classified to what is currently highlighted. That is all. (Maybe we have vim bindings, maybe not, maybe we can ctrl f maybe not. But I think having a very easy surface to write notes and they automatically get linked to the section is very useful.)

- Notes per highlight. Low friction, just type. Hit a shortcut to focus text input.
- Ask LLM about a highlight, same text input just routes to LLM (maybe we store it too).
- Twilight dimming/highlighting, like the reader helpers that focus a word and a letter to make you read at a cadence, it could be nice if this was semantic.
- Can I just auto everything to bullet points (i.e. every unique point is a bullet point with indents)? And maybe with some extra formatting rules / symbols for different things such as linking/related etc.

Can you read it argument by argument? In real time each core premise gets highlighted and you read by moving the "large cursor" forward and backward and it highlights the section. Then you can run other commands on it.

I don't know why but I really do keep picturing the ideal interface as something like Freda+ (from Windows) with just a slightly smarter system built around.

See [[magic-ink]] and [[argument-sandbox]].
