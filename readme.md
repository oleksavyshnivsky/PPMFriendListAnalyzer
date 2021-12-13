# PPMFriendListAnalyzer

Goal: To see when was each PPM friend last time logged in the game. Specifically to highlight those who were last logged more than 14, 21, 50 days ago.

![img](https://drive.google.com/uc?id=1Sbq2BAhDxmsgzZ_lataXciuPbh0hKY4U)

Tested: Latest Chrome for Windows, Tampermonkey extension

Order of actions: 

0. Setup userscript

   - Install userscript extension. For example, [Tampermonkey for Chrome](https://chrome.google.com/webstore/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo) (Alternative: Greasemonkey for Firefox) 

   - Add **PPMFriendListAnalyzer.user.js** as new userscript
   - Open any page that start with *https://ppm.powerplaymanager.com/* — there must be a new item in the upper right corner, partially hidden behind the right side. It will fully come out on mouse over.

1. Click the first button — **Read the friend list** — it will get IDs and Names of friends from the Community/Friends section (all pages)

2. Click the second button — **Check up to 50 friends** — it will get last login times of the friends that were not yet checked during the last 12 hours. Amount and time limitations are added just in case. User can either click this button multiple times (until "*Not checked: —*" in the quick stat under buttons), or change the limitation in the code:

   ```js
       // Amount of friend profiles to check in one run
       const FRIENDS_PER_RUN = 50
   ```

3. Click the third button — **Show friends** — it will replace main content of the page with the full list of friends, ordered by last login time, with the next info:

   - Photo with a profile link that will be opened in a new tab
   - Username (without country and status) with a profile link that will be opened in a new tab 
   - Datetime of the last login. Styles: 
     - bold red — more than 50 days ago;
     - red — more than 21 days ago;
     - orange — more than 14 days ago
   - Amount of teams

4.  Click any photo/username to go to their profile and do whatever is needed there (there is *function unfriend* in the userscript, but I decided not to finish this functionality)

   To update the list, click **Read the friend list** and **Show friends** again

5. Userscript is not designed well enough to keep it always on, so:

   - Click the fourth button — **Before uninstall** — to remove the userscript data from the browser local storage
   - Switch it off in the userscript extension 



