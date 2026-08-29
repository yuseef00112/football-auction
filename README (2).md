# Yousef Games — Football Auction

Node.js + WebSocket multiplayer football auction.
- 2 players per room
- 100M budget each
- 11 rounds: GK, RB, CB, CB, LB, CDM, CM, CM, LW, RW, ST
- Every auction starts at 1M and lasts 15 seconds.
- Highest bidder gets the player. The other player can press Skip to concede immediately.
- The losing player receives a random free player of the same position.
- Final teams are shown and a match is simulated from squad ratings, attack, midfield, defence and goalkeeper strength.
- Player photos are fetched server-side from Wikipedia page summaries and shown in a FUT-style card.
