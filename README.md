# AccurateHR Mobile

The AccurateHR Field view as a native Android and iPhone app. Built with React Native and Expo, in TypeScript. It talks to the AccurateHR Worker at `app.accuratehr.co` and has no server or database of its own.

## What it does today

- Sign in with a company code, email and PIN. The session is kept in the phone's secure store.
- A PIN that was set for you must be changed to your own before anything else opens.
- Home shows who is signed in and where the clock stands (on the clock and for how long, a card left open from an earlier day, or a rest period after a night shift), using the same rules as the web Field view.
- Clock on from Home. With no signal it is saved on the phone and sent once when the signal returns; anything the server then refuses is listed with its reason, to try again or discard.
- Clock off and Add time, on the job card: date, start, finish and lunch, the job (searched by number, name, customer or site), its cost centre (chosen for you when the job has one, or the one you used last time), and the time shared between several cost centres. It is checked and saved by the web form's own rules, and works with no signal.
- The Job card tab: any day's cards and hours, where the day stands with your approver, and what an approver would query. A card opens to change or delete while the day is still yours.
- Submit day and Pull back, from the Job card tab: what stops a day going (still on the clock, something on the phone not sent yet), what an approver would query, a confirm with the day's hours, and what happened afterwards.
- A tab bar (Home, Job card, More). More shows who is signed in and has Sign out.
- Time on an activity instead of a job (training, a toolbox talk, a public holiday on a public holiday, an RDO). One that needs a manager's approval is not time: the form says to request it as leave.
- Home lists the jobs published for you today and tomorrow: the job, customer and site, address, notes, who else is on it and what plant, with Navigate, Call PM and Call team leaders.
- Safety on each of today's jobs: its safe work method statements, each to read and sign on to (with no signal too: the statement is kept on the phone and the sign-on is sent later with the time it was typed), and its start checklists to tick, with a photo where an item asks for one.
- Start on a scheduled job. It is held until the job's statements are signed on to and its start checklists ticked, and while a required item is Not OK. With one cost centre it clocks on straight away; otherwise the job card opens to choose. With a card already open it moves that card onto the job.
- A Safety tab: the same checks for today's and tomorrow's jobs in one place, and the company's policies to read and acknowledge by typing your name.
- My week: a pay period day by day with each day's cards, hours and where it stands, the week's safety counts and leave balances, Copy last week, Submit for one day or all that can go (with a note), and Pull back.
- Chat: the list of chats with the last message and how many are waiting, and a chat with its messages under day chips, the unread line, names in a group, photos shown, links that open, and a box to send a text message. A message typed with no signal waits in the chat and is sent once.
- POs: the ones you have raised (a tap copies the number), and Raise a PO on a job with a supplier (your starred ones first), the job's cost centre, and an optional reference and note. It is raised in simPRO there and then, so it needs signal.
- My leave (from More): your balances, your requests with Submit, Discard or Cancel where each still applies, and the team leave calendar for a level whose Leave reaches their team. Request leave says what a request would be as you fill it in (its hours, the balance after, leave you already have on those days, who else is off), and an activity on a job card that needs approval leads straight to it. Needs signal.
- My expenses (from More): the four figures over your claims and the claims themselves. A claim has its date, description and lines; a line is a receipt or amount (with a photo of the receipt) or a distance paid at the company's rate, and can be charged to a job's cost centre. A draft or a claim sent back can be changed, sent or deleted. Needs signal.
- My qualifications (from More): the four figures over your tickets, what you have sent in for review (Withdraw while it waits), and the tickets on your record with Renew / update. Submit a ticket takes photos of the card with the camera and what is printed on it, and sends it for an admin to check. Needs signal. Scan a card is still to come.
- My documents (from More, for a level with the Documents area): the three figures over them, the ones waiting on you (Sign or Acknowledge with your typed name), and everything on file, with Open the file where a document has one (it opens in the phone's own app for it and is not kept on the phone). A contract is still read and signed in the browser.
- My assets (from More): the three figures over what you hold, and each item with Report issue (its condition has changed, it is damaged, lost or stolen, or just a check-in, with the condition it is in now and a note). Needs signal.
- My forms (from More): the forms still to fill in and the ones already sent. A form is filled in with each question in the box its kind asks for (text, a choice, yes or no, a date, a photo taken with the camera), your earlier answers filled in, and can be updated any time. Needs signal.
- Safety reports (from the Safety tab, for a level with the safety register): the emergency numbers with the company's own regulator, Report incident, Property damage and Report hazard (the same questions as the web forms, with photos taken with the camera), your own reports and the hazards everyone sees, and a report read back in its sections. Needs signal.
- Notifications (from More): what you have been told, newest first; a tap marks one read and opens the screen it is about, and Mark all read clears the count. Under More, your own settings: notification emails on or off, My morning note (the hour it arrives, and whether it is emailed too) and Change PIN.
- Home opens with no signal, on the copy kept from last time.
- Sign out, which forgets everything kept on the phone.

The week's history, sending photos, voice messages and documents in Chat (and replies, reactions, new chats and groups), and the rest of More are still to be built. Until then people use the Field view in a browser.

## Trying it on an Android phone

No store account is needed.

1. On GitHub, open the **Actions** tab, choose **Android build**, then **Run workflow**. Choose `production` (your real company) or `staging`.
2. When the run finishes, download the file under **Artifacts** and unzip it. Inside is `app-release.apk`.
3. Send the file to the phone and open it. Android asks once to allow installing from that source.

The staging build installs beside the production one as "AccurateHR (staging)".

Every build has its own number: the one at the end of the file's name under Artifacts (`AccurateHR-production-57`). The bottom of the More tab says which build is on the phone, with the commit it was made from: "Version 0.1.0 · build 57 (1a2b3c4)". Android also uses the number to know a newer build from an older one.

An iPhone cannot install an app this way. iPhone builds need the Apple Developer account.

## Working on it

```bash
npm install
```

```bash
npm run check
```

```bash
npx expo start
```

The app shares its rules with the web app. They are copied from the AccurateHR repo, never written twice:

```bash
npm run sync:shared -- ../AccurateHR
```

See `CLAUDE.md` for the rules of the project.
