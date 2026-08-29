# Yousef Games — Football Auction

Node.js + WebSocket multiplayer football auction.
- 2 players per room
- 100M budget each
- 11 rounds: GK, RB, CB, CB, LB, CDM, CM, CM, LW, RW, ST
- Every auction starts at 1M and lasts 20 seconds.
- Each round randomly chooses who starts. Only the player whose turn it is can bid; the buttons are dimmed for the other player.
- The losing player receives a random free player of the same position.
- A 4-second result screen appears between rounds showing both players' acquired cards. Final matches use an AI-style rating engine driven by squad strength, attack, midfield, defence, goalkeeper, shooting, passing, expected goals and possession.
- Player photos are fetched server-side from Wikipedia page summaries and shown in a FUT-style card.
- After the match, either player can press Replay Match to reset both budgets/teams and start another match in the same room.
