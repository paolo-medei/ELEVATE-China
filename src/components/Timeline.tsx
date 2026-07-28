import { useEffect } from 'react';
import { useUi } from '../i18n';
import { dateForDay } from '../data/simulate';
import type { DayWeather } from '../data/types';

export function Timeline({
  day,
  hour,
  days,
  playing,
  weather,
  onDay,
  onHour,
  onPlaying,
}: {
  day: number;
  hour: number;
  days: number;
  playing: boolean;
  weather: DayWeather;
  onDay: (d: number) => void;
  onHour: (h: number) => void;
  onPlaying: (p: boolean) => void;
}) {
  const { t, lang } = useUi();

  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      if (hour >= 23) {
        onHour(0);
        if (day < days - 1) onDay(day + 1);
        else onPlaying(false);
      } else {
        onHour(hour + 1);
      }
    }, 260);
    return () => window.clearInterval(id);
  }, [playing, hour, day, days, onDay, onHour, onPlaying]);

  const date = dateForDay(day);
  const weekday = new Date(`${date}T00:00:00Z`).toLocaleDateString(lang === 'zh' ? 'zh-CN' : 'en-US', {
    weekday: 'short',
    timeZone: 'UTC',
  });

  return (
    <div className="timeline">
      <button
        type="button"
        className="play-btn"
        onClick={() => onPlaying(!playing)}
        aria-label={playing ? t('pause') : t('play')}
        title={playing ? t('pause') : t('play')}
      >
        {playing ? (
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
            <rect x="1" y="1" width="3.5" height="10" rx="1" fill="currentColor" />
            <rect x="7.5" y="1" width="3.5" height="10" rx="1" fill="currentColor" />
          </svg>
        ) : (
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
            <path d="M2 1.2 L11 6 L2 10.8 Z" fill="currentColor" />
          </svg>
        )}
      </button>

      <div className="slider-group">
        <label htmlFor="day-slider">{t('day')}</label>
        <input
          id="day-slider"
          type="range"
          min={0}
          max={days - 1}
          value={day}
          onChange={(e) => onDay(Number(e.target.value))}
        />
      </div>

      <div className="slider-group" style={{ flexBasis: 180 }}>
        <label htmlFor="hour-slider">{t('hour')}</label>
        <input
          id="hour-slider"
          type="range"
          min={0}
          max={23}
          value={hour}
          onChange={(e) => onHour(Number(e.target.value))}
        />
      </div>

      <div className="readout">
        {date} · {weekday} · {String(hour).padStart(2, '0')}:00
      </div>

      <div className="hint">
        {weather.rainMm > 0 ? `${weather.rainMm} mm` : lang === 'zh' ? '无降水' : 'no rain'} ·{' '}
        {weather.tempC.toFixed(0)}°C · {weather.windMs.toFixed(1)} m/s
      </div>
    </div>
  );
}
