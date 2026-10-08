---
title: "A homescreen of actions"
summary: "Why does the homescreen list apps? Why not list actions? Workflows!"
topics: [interfaces]
---

Why do we want to interact with apps, they are a means to an end.

Now really is the perfect time for us to rethink the surface in which we interact with these intelligences.

The concept of an app or browser tabs are too rigid.

You will have a surface of interaction, the mediator will be a model.

The model will ask you what it needs to know and you will answer guiding / steering questions.

The model will function mostly autonomously, either on the same machine you are interacting with it, a separate VM you will rent, or your own hardware/computer.

There are questions around whether they will operate in parallel to you, or exclusively.

You will want to have tasks running in the background while you go off and do other things.

## The notification panel

Notifications will likely stay around as a way for you to monitor.

But what happens when you click the notification popup? The work is done, where does clicking it take you? To the overall monitor page? Or to the results of that work?

Will we rethink the notification panel? We separate them by different apps, which are a rough proxy for different workflows, but what happens when you are detached from those and operate one level above it?

Maybe that's my unpopular opinion! Most people live in their notification panel (is there an audit on exact screentime breakdown, or most repeated actions? It's probably swiping down to see your notifications!)

So how will most people want to deal with that? Why is this the case?

Well it is the surface where you see the incoming results, it's the volcanic geyser where you sit and absorb all of the new happenings. Do people actually like this? Would they rather only interact through one medium (well think of the notification panel as the medium! And the different apps are unfortunately different side channels that are inefficient)?

Will people actually want to context switch between them? Opening Instagram, DMing a friend, opening iMessage responding to your boss. Opening Safari to fill out a form. Opening your gallery to find the receipt you took a photo of last night, to then upload to Venmo to send to your friends.

So many clicky button presses, swipes, etc etc.

## List actions, not apps

Will the notification panel get reshaped, what about the home screen? Why does the homescreen list apps? Why not list actions? Workflows!

Such as:
- text conversation with your mother
- the email you need to respond to
- event that is in your calendar for tomorrow, booking an Uber now is cheapest!
- any "open threads" or repeated workflows you do often
    - things that are relevant right now because of recent information: recent email asking for invoice, on your homescreen you will see a suggestion to "create a PDF invoice based on the recent hours logged in xyz"
- your friend asks "how was your trip", the model can suggest 5 photos to send to them.

And it could simply just be a list. You can either tap to "open/execute/configure", swipe one way to dismiss, swipe another to drop it down the list. One simple swipe is just "do later, not important now" and slowly over time things will crawl/jump back up the list.

We can kind of argue the notification panel is already like this. It is a temporally ordered list of recent events. However the improvements to be made are:
- temporal is a proxy for importance. A sufficiently aligned model can infer what is important for you and what is bs. (It should also consider your overall goals etc.)

The specific interface shown would really depend on the nature of the decision. Or the work.

So much of it can be overhauled. Maybe I want an open source phone! GrapheneOS could be cool. I just want something I can code UI myself :D

## Starting it on my machine

Can I make a simple version on my machine for my todo list, it doesn't have to be mobile! Start with desktop.

- I have items I preadd on my todo list, it orders these.
- It can see new open threads that pop up, plans, calendar, messages, etc.
- It should have an understanding of my broader goal for either the day or week/future.
- It should prioritize the goal more than anything. Everything is a means to an end, being the goal.
- It could monitor my actions on my machine and determine whether I am working towards the goal.
    - have a "momentum" score. Maybe it can tell when I am fading.
- Should it "decompose" the goal in some way, or brutally just hold it as a high level? How much of my brainpower is spent trying to decide what is the best move to do, rather than executing. It should probably lean towards "just do the thing".
- I need it to be FASTTTT. Maybe I have small fast models, or hastily crafted UI (precomputed) and there are bigger models/scheduling jobs that can update async.

See [[guardian-angels]] and [[human-in-the-loop]].
