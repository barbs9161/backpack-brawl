import { TICK_SECONDS, MAX_TICKS } from '../battle';
import { describeEffects, getItem } from '../items';
import { EFFECT_HELP, STATUS_HELP, SET_HELP } from '../rules';
import { ITEM_SETS } from '../sets';
import type {
  BattleEvent,
  BattleEventKind,
  BattleReplay,
  Fighter,
  FighterSnapshot,
  Side,
} from '../types';

interface BattleViewProps {
  battle: BattleReplay;
  done: boolean;
  /** Text for the button that leaves the finished replay. */
  continueLabel: string;
  onSkip: () => void;
  onContinue: () => void;
}

export function BattleView({ battle, done, continueLabel, onSkip, onContinue }: BattleViewProps) {
  const { result, opponent } = battle;
  const frame = result.frames[battle.frame];
  const log = result.frames
    .slice(1, battle.frame + 1)
    .flatMap((f) => f.events)
    .reverse();
  const won = result.winner === 'player';

  return (
    <section className="flex flex-col gap-4 rounded-lg border border-panel-edge bg-panel p-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-xl font-bold">
          ⚔️ Round {opponent.round} vs {opponent.icon} {opponent.name}
        </h2>
        <span
          className="cursor-help font-mono text-sm text-muted"
          aria-label="Battle time"
          title={STATUS_HELP.timer}
        >
          ⏱ {(frame.tick * TICK_SECONDS).toFixed(1)} s / {MAX_TICKS * TICK_SECONDS} s
        </span>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        <FighterPanel side="player" icon="🧝" fighter={battle.player} snapshot={frame.player} />
        <FighterPanel
          side="opponent"
          icon={opponent.icon}
          fighter={battle.enemy}
          snapshot={frame.opponent}
        />
      </div>

      {done ? (
        <div
          role="status"
          className={`flex flex-col items-center gap-3 rounded-md border-2 p-4 text-center ${won ? 'border-gold bg-gold/10' : 'border-life bg-life/10'}`}
        >
          <p className="font-display text-2xl font-bold">{won ? '🏆 Victory!' : '💀 Defeat'}</p>
          <p className="text-sm text-muted">
            {result.reason === 'knockout'
              ? `${won ? opponent.name : 'Your hero'} was knocked out.`
              : `Time ran out — ${won ? 'you' : opponent.name} kept the higher share of HP.`}{' '}
            {won ? '+1 win.' : '−1 life.'}
          </p>
          <button
            type="button"
            onClick={onContinue}
            autoFocus
            className="rounded-md bg-gold px-4 py-2 font-bold text-ink hover:brightness-110"
          >
            {continueLabel}
          </button>
        </div>
      ) : (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onSkip}
            className="rounded-md border border-panel-edge px-4 py-1.5 hover:bg-panel-edge/40"
          >
            ⏭ Skip
          </button>
        </div>
      )}

      <section>
        <h3 className="mb-2 font-bold">📜 Combat log</h3>
        <div className="rounded-md bg-ink/50 p-2 text-sm">
          <div
            className={`${LOG_ROW} border-b border-panel-edge pb-1 text-xs uppercase tracking-wider text-muted`}
          >
            <span>🧝 {battle.player.name}</span>
            <span>Time</span>
            <span className="text-right">
              {battle.enemy.name} {opponent.icon}
            </span>
          </div>
          <ol className="flex max-h-64 flex-col gap-1 overflow-y-auto pt-1" aria-live="off">
            {log.length === 0 && (
              <li className="text-center text-muted">The fighters size each other up…</li>
            )}
            {log.map((event, index) => (
              <LogLine key={log.length - index} event={event} />
            ))}
          </ol>
        </div>
      </section>
    </section>
  );
}

/** Hero actions | time | enemy actions. */
const LOG_ROW = 'grid grid-cols-[1fr_auto_1fr] items-start gap-2';

/** Text colour per battle event kind. */
const EVENT_COLOUR: Partial<Record<BattleEventKind, string>> = {
  damage: 'text-life',
  poison: 'text-purple-400',
  poisonTick: 'text-purple-400',
  heal: 'text-green-400',
  burn: 'text-orange-400',
  burnTick: 'text-orange-400',
};

function LogLine({ event }: { event: BattleEvent }) {
  const icon = event.itemId
    ? getItem(event.itemId).icon
    : event.kind === 'poisonTick'
      ? '☠️'
      : event.kind === 'burnTick'
        ? '🔥'
        : '⚔️';

  const byPlayer = event.source === 'player';
  const text = (
    <span
      className={`flex gap-1.5 ${byPlayer ? '' : 'flex-row-reverse text-right'} ${EVENT_COLOUR[event.kind] ?? ''}`}
    >
      <span aria-hidden>{icon}</span>
      <span>{event.message}</span>
    </span>
  );

  return (
    <li className={LOG_ROW}>
      {byPlayer ? text : <span />}
      <span className="font-mono text-xs leading-5 text-muted">
        {(event.tick * TICK_SECONDS).toFixed(1)}s
      </span>
      {byPlayer ? <span /> : text}
    </li>
  );
}

interface FighterPanelProps {
  side: Side;
  icon: string;
  fighter: Fighter;
  snapshot: FighterSnapshot;
}

function FighterPanel({ side, icon, fighter, snapshot }: FighterPanelProps) {
  const { hp, maxHp, block, poison, burn } = snapshot;
  const knockedOut = hp <= 0;

  return (
    <article
      aria-label={side === 'player' ? 'Your hero' : fighter.name}
      className={`flex flex-col gap-2 rounded-md border-2 p-3 ${side === 'player' ? 'border-gold/60' : 'border-life/60'} ${knockedOut ? 'opacity-50' : ''}`}
    >
      <h3 className="flex items-center gap-2 font-display text-lg font-bold">
        <span className="text-3xl" aria-hidden>
          {knockedOut ? '💀' : icon}
        </span>
        {fighter.name}
      </h3>

      <Bar
        label="HP"
        value={hp}
        max={maxHp}
        text={`${hp} / ${maxHp}`}
        colour="bg-life"
        help={STATUS_HELP.hp}
      />
      <Bar
        label="Block"
        value={block}
        max={maxHp}
        text={`🛡️ ${block}`}
        colour="bg-block"
        help={STATUS_HELP.block}
      />
      <div
        className="flex cursor-help justify-between text-xs text-purple-400"
        title={STATUS_HELP.poison}
      >
        <span>Poison</span>
        <span className="font-mono">☠️ {poison}</span>
      </div>

      <div
        className="flex cursor-help justify-between text-xs text-orange-400"
        title={STATUS_HELP.burn}
      >
        <span>Burn</span>
        <span className="font-mono">🔥 {burn}</span>
      </div>

      <ul className="flex flex-wrap gap-1" aria-label="Items">
        {fighter.items.map((item, index) => (
          <li
            key={index}
            title={[
              item.name,
              ...describeEffects(item.effects).map(
                ({ effect, label }) => `${label}\n${EFFECT_HELP[effect]}`,
              ),
              `⏱️ every ${item.cooldown * TICK_SECONDS}s`,
              ...(item.setId ? [SET_HELP[item.setId]] : []),
            ].join('\n')}
            className="flex cursor-help flex-col items-center rounded bg-ink/50 px-1.5 py-0.5 text-xl"
          >
            {item.icon}

            {item.setId && (
              <span
                className={`text-xs font-semibold ${
                  item.setId === 'fire' ? 'text-orange-400' : 'text-blue-400'
                }`}
              >
                {ITEM_SETS[item.setId].icon} {ITEM_SETS[item.setId].name}
              </span>
            )}
          </li>
        ))}
      </ul>

      <div className="border-t border-panel-edge pt-2">
        <h4 className="mb-1 text-xs font-bold text-muted">Active set bonuses</h4>

        {fighter.activeSets.length === 0 ? (
          <p className="text-xs text-muted">None</p>
        ) : (
          <div className="flex flex-col gap-1">
            {fighter.activeSets.map((setId) => {
              const set = ITEM_SETS[setId];

              return (
                <div
                  key={setId}
                  className={`rounded border p-2 text-xs ${
                    setId === 'fire'
                      ? 'border-orange-400/50 bg-orange-500/10 text-orange-400'
                      : 'border-blue-400/50 bg-blue-500/10 text-blue-400'
                  }`}
                >
                  <p className="font-semibold">
                    {set.icon} {set.name} — Active
                  </p>

                  <p>
                    {describeEffects(set.bonus)
                      .map(({ label }) => label)
                      .join(', ')}{' '}
                    per set item activation
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </article>
  );
}

function Bar({
  label,
  value,
  max,
  text,
  colour,
  help,
}: {
  label: string;
  value: number;
  max: number;
  text: string;
  colour: string;
  help: string;
}) {
  const percent = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div title={help} className="cursor-help">
      <div className="flex justify-between text-xs text-muted">
        <span>{label}</span>
        <span className="font-mono">{text}</span>
      </div>
      <div
        className="h-3 overflow-hidden rounded-full bg-ink"
        role="meter"
        aria-label={label}
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
      >
        <div
          className={`h-full ${colour} transition-[width] duration-200`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
