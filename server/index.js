import { createApp } from "./app.js";
import { createLeaderboardStore } from "./leaderboard.js";

const app = createApp({ leaderboardStore: createLeaderboardStore() });
const port = Number(process.env.PORT ?? 4200);

app.listen(port, () => console.log(`Backpack Brawl API listening on http://localhost:${port}`));
