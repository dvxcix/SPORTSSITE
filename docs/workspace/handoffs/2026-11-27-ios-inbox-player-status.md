# Player names in iOS Activity

The signed-in iPad regression found injury alerts displaying only a status,
such as “inactive.” A bounded read of the existing alert archive found stored
player names on all five recent short-status injury rows. The API was returning
the portrait and status while omitting the saved name.

The native notifications GET now returns a validated player name on
system-generated injury and roster alerts. The iOS Activity row combines it
with short status text. Longer provider messages, portraits, destinations,
and the existing member and block filters retain their behavior. No collector,
notification replay, or database mutation is involved.

This continues the archived research checkpoint at `ccdbe005`. The physical
research follow-up restored the FanDuel benchmark and the native NFL scoreboard
displayed the live Denver–Pittsburgh score. The private QA room composer raised
and hid the keyboard and offered Photo, GIF, and Emoji without sending a post.

The signed-in protected preview passed on Devin’s iPad at 756 × 1158 and
375 × 720 points. The real Activity rows rendered the names alongside their
recorded inactive status, and the compact test scrolled the named rows into
view. The signed-out preview returned 401. The five player-news tests, Hub
TypeScript check, and Xcode builds passed. The You avatar opened the signed-in
profile, then Account settings opened Appearance on the full-screen iPad.

The release changes for the canonical site are in
[archive draft PR #104](https://github.com/dvxcix/SPORTSSITE/pull/104) and
[player-status draft PR #105](https://github.com/dvxcix/SPORTSSITE/pull/105).
Production remained READY on main at `fdfeb1f8`. Devin’s iPad is running the
local Launch QA build with the two feature reads on the protected preview.
Distribution and broader role and purchase checks remain open.
