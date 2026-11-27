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

The new server and view source is staged for signed-in preview testing on
Devin’s iPad. Production is still on the verified main checkout.
