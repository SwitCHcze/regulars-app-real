# Regulars: project overview

A short summary of the app, for giving context to Claude or anyone new to the project.

## What it is
Regulars puts university students into small groups of up to 6 that meet once a week, for 8 weeks, to do something easy (coffee, games, a walk, crafts, studying). It's the same people every week, because seeing familiar faces again and again is how strangers become friends.

Tagline: "The same small group, once a week, for something easy."

## Who it's for
Students who find it hard to make friends. They're often the least likely to go looking for help, so Regulars reaches them through the university itself: halls, welcome week, Res Life and the wellbeing team. People join because they're new, because their friends are busy, or because big events and societies aren't their thing. Nobody has to say why, and quiet people are welcome.

## Business model
- Free for students, with no subscriptions.
- Universities and halls pay a fee per term.
- It works at any university: a student's university is detected from their university email.
- Each university gets a version in its own colours. University of Portsmouth comes first.

## How it works for a student
1. **Sign up** (about a minute, 3 steps, no profile to write):
   - Pick the activities you'd fancy.
   - Optional: rule out days that never work, say how much chat suits you, and say what would make it easier to come.
   - Enter your university email and confirm it with an emailed code (no password). Then give a first name, an optional picture (it stays on the phone and is never uploaded), confirm you're 18 or over, and agree to the terms.
   - The app never asks about health, course, or why you're joining, and groups are never matched on these.
2. **Waiting list**, then you're offered a place in a group of students who can make the same weekly time. Each group has a named, trained student host.
   - You can "Meet a host first": a short, informal hello before you commit. It isn't counselling.
3. **In a group**, the app has 5 tabs:
   - **This week**: the plan, "I'm in" / "Can't make it", a count of who's coming (e.g. 3 of 6), where to meet with directions, cost (free), access info, what to do if the host is late, "Walk in together" (the host can meet you on the way), conversation starters, email reminders (5pm the day before and 2 hours before), and add to calendar.
   - **Group**: the members, "Ask something privately", "This group isn't working for me", "Something made me uncomfortable", and an invite link (no reward).
   - **Vote**: each week has two approved activity options at the same time and place. A tie or no votes means the first option goes ahead. Members can also suggest another time for a week and the group votes on it.
   - **Support**: Samaritans 116 123, Shout 85258, Student Space, university services, 999 for emergencies, private messages to the Regulars coordinator, and reporting a concern.
   - **Perks**: discounts at local partner places (see below). Also shown on the waiting list, when offered a place and while paused.
4. **Profile**: pause (your place is kept), edit preferences, opt out of check-ins about missed sessions, light/dark mode, request a copy or deletion of your data, leave, sign out.

## Perks
UNiDAYS-style discounts at local businesses, for verified members only (waiting list, offered a place, in a group, paused). Never for anonymous visitors or people who have left.
- If your group's venue is a partner, its deal is shown first and is the best offer, so the focus stays on meeting up.
- Then a list of partner offers (business, type, offer, area, conditions), with filter chips: All, Food and drink, Games, Active, Other.
- Tapping an offer shows a code to show at the till, with your first name and the initial picture only. Partners never see names or emails.
- No countdowns, limited stock, streaks or "use it or lose it".

## End of the cycle: "again?"
After week 8, This week asks: "That's the 8 weeks. Fancy doing this again with any of them?" It's private and mutual:
- For each other member (first name and initial): "Happy to be in a group with them again". Plus "Keep this group going as it is" or "I'd like a fresh group next time" (one or the other, or neither).
- "Only you see your answers. Nobody is ever told who said no." There's no match reveal: if two people both say yes, they're just more likely to be grouped together next term.
- Answers can be changed until the end of the week. Skipping is fine ("Not now"), with no reminders beyond one gentle email.
- Answers are only collected and stored for forming next term's groups. No automatic matching.

## Attendance rules (deliberately gentle)
- "Can't make it" works any week, with no reason needed and no limit.
- Miss a few sessions without saying and you may get one friendly message. Nobody else is told.
- If you go quiet for a long time, you're asked whether you want to keep your place. A person decides, never the app, and you're told first.
- You can come back any time, though possibly to a different group.
- Small weeks still go ahead if possible. If a session is cancelled, students are told and offered an alternative.

## Privacy
- **Your group sees:** first name, initial, what you'd fancy, and whether you're coming.
- **Your group never sees:** your email, why you joined, your picture, private messages, or reports.
- **Your university sees** totals only, never names or answers.
- **Coordinators** see individual records so they can run the programme.

## Programme settings (per university/pilot)
8 weeks, groups of 4 to 6 (target 6), a cap on participants (e.g. 48 in the pilot), enrolment open or closed, and allowed university email domains.

## Tech
- Mobile-first web app (PWA), installable on the home screen. Plain HTML, CSS and JavaScript, with British English copy.
- **This repository** holds the front-end prototype: everything runs in the browser with example data, and there is no server yet (see `README.md`).
- **The connected version** talks to a Django backend: `/api/state/` for everything shown on screen, plus `/api/auth/...` and `/api/decline/`. Login uses django-allauth email codes, and staff accounts also use an authenticator app (2FA). Every change is saved by the server before the screen updates.
- Supports light/dark mode, per-university themes, and an offline notice.

## Tone
Warm, low-pressure and plain. No guilt, no streaks, no gamification. "Quiet is fine."

## State fields and endpoints added for the demo
These are answered by `demo.js` in this repo. The Django backend needs to provide the same.

### Perks
`participant.perks` in `/api/state/`. Leave it out (or `null`) for anyone who isn't a verified member; the Perks tab is hidden then.
```json
"perks": {
  "group_venue_offer_id": 1,
  "offers": [
    {
      "id": 1,
      "business": "Shelf Life Café",
      "type": "cafe",
      "offer": "Free table for your group, 20% off drinks and cakes",
      "conditions": "During your group's meetup",
      "area": "Library ground floor",
      "is_group_venue": true
    }
  ]
}
```
- `type` is one of `cafe`, `food`, `games`, `climbing`, `cinema` (anything else is filed under "Other").
- `group_venue_offer_id` is `null` unless the member is in a group whose venue is a partner.

`POST /api/perk_redeem/` with `{ "offer_id": 1 }` returns `{ "code": "REG-7K2P" }`. The code is shown at the till with the member's first name and initial. The demo makes a code locally and saves nothing.

### End of the cycle: "again?"
`participant.cycle` in `/api/state/`:
```json
"cycle": { "week": 8, "weeks": 8, "again_open": true, "again_answered": false,
           "my_again": { "keep_group": false, "fresh_group": false, "again_with": [101, 103] } }
```
- `again_open` is true from the end of week 8 until the end of that week; the card and screen only show while it's true and the member is in a group.
- `my_again` is the member's own saved answers (or `null`), so they can change them. Never include anyone else's answers.
- `week` is also used for the "Week 8 of 8" label once there's no upcoming `session`.
- Each `group.members[]` needs a stable `id` while `again_open` is true (members are listed by first name and initial only).

`POST /api/again/` with `{ "keep_group": bool, "fresh_group": bool, "again_with": [member ids] }` saves the answers and returns the fresh state. The demo keeps them in memory only.
