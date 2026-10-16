// Retention mechanics (credits only — nothing here has cash value)
const DAY = 864e5;
// Daily streak: claim every 24h; claiming within 48h of the last claim keeps the streak going.
const STREAK_REWARDS = [500, 600, 700, 800, 1000, 1200, 1500]; // day 7+ stays at 1500
const streakReward = day => STREAK_REWARDS[Math.min(day, STREAK_REWARDS.length) - 1];
function nextStreak(user, now) {
  const last = user.lastClaim || 0;
  if (now < last + DAY) return null;                       // too early
  return last && now <= last + 2 * DAY ? (user.streak || 0) + 1 : 1;  // keep or reset
}
// XP: 1 XP per credit wagered. Level L needs 250*(L-1)^2 total XP.
const xpForLevel = L => 250 * (L - 1) ** 2;
const levelFor = xp => Math.floor(Math.sqrt(xp / 250)) + 1;
const RANKS = [[1, 'Recruit', '🪖'], [3, 'Private', '🎖️'], [5, 'Corporal', '⚔️'], [8, 'Sergeant', '🛡️'], [12, 'Lieutenant', '⭐'], [16, 'Captain', '🌟'], [20, 'Major', '💠'], [25, 'Colonel', '🔱'], [32, 'General', '👑'], [40, 'Warlord', '🐉']];
const rankFor = level => { let r = RANKS[0]; for (const x of RANKS) if (level >= x[0]) r = x; return { name: r[1], icon: r[2], minLevel: r[0] }; };
const levelUpBonus = L => 100 * L;
// Achievements: id -> [title, description, reward credits, test(ctx)]
const ACHIEVEMENTS = {
  first_blood: ['First Blood', 'Play your first game', 100, c => c.games >= 1],
  grinder: ['Grinder', 'Play 100 games', 1000, c => c.games >= 100],
  high_roller: ['High Roller', 'Place a single bet of 1,000+', 500, c => c.bet >= 1000],
  moonshot: ['Moonshot', 'Cash out Crash at 10× or more', 1000, c => c.game === 'crash' && c.mult >= 10],
  paper_hands: ['Paper Hands', 'Cash out Crash under 1.10×', 50, c => c.game === 'crash' && c.payout > 0 && c.mult < 1.1],
  natural: ['Natural', 'Hit a blackjack', 300, c => c.outcome === 'blackjack'],
  double_trouble: ['Double Trouble', 'Win a doubled blackjack hand', 300, c => c.outcome === 'win' && c.doubled],
  hot_hand: ['Hot Hand', 'Win 5 coinflips in a row', 500, c => c.flipStreak >= 5],
  loyal: ['Loyal Soldier', 'Reach a 7-day login streak', 1000, c => c.streak >= 7],
  veteran: ['Veteran', 'Reach level 10', 1500, c => c.level >= 10],
  recruiter: ['Recruiter', 'Refer a friend', 250, c => c.refs >= 1],
};
// returns newly unlocked ids (and does not mutate)
const checkAchievements = (have, ctx) => Object.keys(ACHIEVEMENTS).filter(id => !have.includes(id) && ACHIEVEMENTS[id][3](ctx));
const REF_BONUS = 500;
module.exports = { DAY, STREAK_REWARDS, streakReward, nextStreak, xpForLevel, levelFor, rankFor, levelUpBonus, ACHIEVEMENTS, checkAchievements, REF_BONUS, RANKS };
