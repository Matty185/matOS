# Setting up Northside BJJ on MatOS

You do most of this at home as a temporary owner, then hand over to the head coach at the academy. You'll have your laptop and phone there, and the coach will have a laptop.

**Time:** about an hour at home, about 7 days for members to sign up, then 20–30 minutes with the coach.

**Site:** https://matos-pi.vercel.app

## Who ends up with what

| Person        | During setup | At the end | How they get in                                           |
| ------------- | ------------ | ---------- | --------------------------------------------------------- |
| You           | Owner        | Athlete    | A link from the setup script, plus your existing password |
| Head coach    | Owner        | Owner      | A link you create in MatOS                                |
| Other coaches | Coach        | Coach      | A link you create in MatOS                                |
| Members       | Athlete      | Athlete    | A sign-up link, or an invite once you've added them       |

## Part 1: create the academy (10 minutes)

1. **Get from the coach:** their email address and how they spell their name, plus:
   - the monthly prices;
   - the waiver text, if they have one;
   - their OK for you to hold owner access during setup. You'll be able to see member and payment details.
2. **Set your own password first.** Your personal email already has an account from the old demo gym, but you don't have its password, and you'll need one in step 4. Run this, open the link it prints within the hour, and choose a password:

   ```
   npm run provision-gym -- --owner-reset --owner-email YOUR_EMAIL --app-url https://matos-pi.vercel.app
   ```

   The link works once. Save the password in your password manager. You don't need to do anything else on the old demo gym.

3. **Create the academy.** In a terminal, from the project folder:

   ```
   npm run provision-gym -- --name "Northside BJJ" --owner-email YOUR_EMAIL --owner-first YOURFIRSTNAME --owner-last YOURSURNAME --owner-belt YOURBELT --contact-email COACH_EMAIL --timezone Europe/Dublin --app-url https://matos-pi.vercel.app
   ```

   `--contact-email` is what shows as the academy's contact, so it stays correct after you step back. It should print a note that your email already has a MatOS login. That's expected.

4. **Open the link it prints, straight away,** and enter your existing password. MatOS opens the setup steps.

**If something goes wrong:** if the script reports an error, or you lose the link before using it, don't run it again. Bring the message to Claude. The script's usual `--relink` command won't work for your email, because your account already owns the old demo gym.

## Part 2: set up the academy (about 45 minutes)

Work through the setup steps. You can leave and come back by signing in again; anything saved stays saved.

| Step             | What to do                                                                                               |
| ---------------- | -------------------------------------------------------------------------------------------------------- |
| **Your academy** | Check the name, add the address, and confirm the time zone is Europe/Dublin. Check-in times depend on it |
| **Timetable**    | Add each weekly class: name, type, day, start time, length. Set Programme and Coach if you know them     |
| **Coaches**      | Add the head coach and any other coaches. See below                                                      |
| **Members**      | Skip for now. See Part 3                                                                                 |
| **Invites**      | Skip for now                                                                                             |
| **Done**         | Finish. You land on the Dashboard                                                                        |

### Adding the head coach as an owner

Order matters here, because changing someone's role cancels any unused link:

1. In **Coaches**, add the head coach. Ignore the link it offers.
2. Go to **Settings → Team** and change their role to **Owner**.
3. Create a new invite link for them, and keep it for Part 4. It lasts 7 days, so create a fresh one if the visit is further away than that. Treat it like a password.

Create links for the other coaches now or later, as suits.

### Settings to check

Under **Settings**:

- **Membership plans:** add the real names and prices. Prices only pre-fill the payment form; MatOS doesn't charge anyone.
- **Promotions:** classes and months per stripe. The defaults are 30 classes or 3 months. Check these with the coach.
- **Logo:** upload the academy's logo if you have it.
- **Waiver:** leave this for Part 4. It's the coach's legal text, so they should read and publish it.

Leave **Free trial link** and **Front-desk kiosk** for later unless the coach asks.

## Part 3: get members on

**A sign-up link works for one person, once.** Whoever opens it first uses it up, so **a single link posted in the group chat won't work**. The second person would be refused.

Until there's a shareable group link, use this:

1. **Send sign-up links privately.** On **Members**, create a sign-up link for each person and message it to them directly. Each lasts 7 days, and you can have up to 30 unused at a time. Each person enters their own details, belt and password, and joins as an athlete.
2. **Post in the group chat** that links are going out, so nobody treats theirs as spam:

   > Northside is moving to MatOS for check-ins and memberships. You'll get a personal link from me. It takes two minutes and only works for you, so please don't forward it.

3. **After about a week, add the rest by hand.** Use **Members → Import** or add them one at a time, with their real belt, stripes and join date. Then invite them from **Invites**, by message or a printed QR sheet.

**Order matters:** if someone is already on the roster, their sign-up link is refused and they need a personal invite instead. So let people sign up first and add stragglers after.

**Kids:** sign-up links aren't for children. Add each child by hand with the email left blank, which gives them no login. A coach can mark them present. To give a parent a login, open the child's profile and add them under **Parents**.

**Payments:** MatOS won't show months before this one as overdue. It only counts from the month the academy was created.

## Part 4: at the academy, with the coach (20–30 minutes)

Let the coach do the typing on their own laptop.

1. **Coach claims their account.** They open their invite link, set a password and tick the consent box. If the link has expired, create a new one under **Settings → Team**.
2. **Show them around:** Dashboard, Members, Attendance, Payments, Settings.
3. **Publish the waiver.** The coach pastes in the text, reads it and publishes it under **Settings → Waiver**. Members are then asked to sign.
4. **Run the test below,** while you're still an owner.
5. **Hand over.** The coach goes to **Settings → Team** and changes your role to **Athlete**. Only they can do this, because nobody can change their own role.
   Do this last, once you've confirmed the coach can sign in by themselves.
6. **Fix your own record.** The coach opens your profile and sets your real join date and plan. You now count as a paying athlete if you're on a monthly plan.

### Quick test

1. **Check in on your phone.** Check-in opens 30 minutes before a class and closes when it ends, so you need a class in that window. If there isn't one, add a temporary class for today. Afterwards, remove your check-in under Attendance and delete the class, because a class with check-ins can't be deleted.
2. **Coach:** open **Attendance** and confirm your check-in appears.
3. **Coach:** open **Settings → Team** and confirm you're both listed as owners. This is the first run of the owner handover since the rebrand, so check it before relying on it.
4. **Coach:** open the assistant button and ask "who's overdue?"
5. **Coach:** post a test announcement, check that it shows on the Dashboard, then take it down.

## Before you leave

- [ ] Coach can sign in by themselves on their laptop
- [ ] Coach has saved their password somewhere safe
- [ ] You now show as **Athlete**, and the coach as **Owner**
- [ ] Waiver published, or a date agreed for doing it
- [ ] Anyone still missing has been added, or the coach knows how to do it
- [ ] Coach knows who to ask when something goes wrong (you)
- [ ] Agreed when you'll check in again, for example after one week

**What to tell members:** "Check in on your phone when you arrive at class." On a phone they can also add the site to their home screen so it opens like an app. There's no App Store app yet.

## If something goes wrong

| Problem                                    | What to do                                                                                                                            |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| A sign-up link says it's already been used | Someone else opened it, or it was forwarded. Check **Members** for an unexpected name, deactivate them if needed, and send a new link |
| A member forgot their password             | A coach opens the member's profile and creates a reset link. It works once, for 1 hour                                                |
| An invite link expired or was lost         | A coach opens the member's profile and sends a new invite                                                                             |
| The head coach forgot their password       | Run the `--owner-reset` command from Part 1 with the coach's email                                                                    |
| A member can't check in                    | Check the time: it's only open from 30 minutes before a class until it ends. Otherwise a coach marks them present under Attendance    |
| Someone has the wrong belt or details      | A coach edits them on their profile                                                                                                   |
| A check-in went to the wrong person        | A coach removes it under Attendance                                                                                                   |
| Anything else                              | Write down what happened and what the screen said, and carry on. Bring it to Claude afterwards                                        |

Email isn't switched on yet, so MatOS won't email invites or password resets. Everything goes by link or QR code. `matos_email_setup.md` covers this for when you get a domain.
